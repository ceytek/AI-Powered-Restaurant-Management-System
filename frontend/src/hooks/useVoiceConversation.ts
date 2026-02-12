/**
 * useVoiceConversation — Robust Adaptive VAD + Turn-Taking
 *
 * States:
 *   IDLE           → Not in a call
 *   CALIBRATING    → Measuring ambient noise level (~1.5s)
 *   LISTENING      → Mic live, waiting for user speech
 *   USER_SPEAKING  → VAD detected speech, recording audio
 *   PROCESSING     → Speech ended, audio sent to backend
 *   AGENT_SPEAKING → TTS playing agent response
 *
 * VAD Features:
 *   1. Adaptive noise floor (calibration + slow EMA)
 *   2. Hysteresis: onset threshold > offset threshold (prevents oscillation)
 *   3. Onset hangover: ~300ms sustained above-threshold before speech trigger
 *   4. Speech band energy ratio: 300-3400Hz vs total energy (music rejection)
 *   5. High-pass filter at 80Hz (rumble/bass rejection)
 *   6. Peak RMS gating on recorded audio
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { aiService } from '@/services/aiService';

/* ───────── Types ───────── */
export type ConversationState =
  | 'IDLE'
  | 'CALIBRATING'
  | 'LISTENING'
  | 'USER_SPEAKING'
  | 'PROCESSING'
  | 'AGENT_SPEAKING';

export interface VoiceConversationCallbacks {
  onSessionId: (id: string) => void;
  onUserMessage: (text: string) => void;
  onAgentMessage: (text: string, latencyMs?: number, toolsUsed?: string[]) => void;
  onCallActive: (active: boolean) => void;
  onError: (msg: string) => void;
  onProcessingStage?: (stage: string) => void;
}

export interface VoiceConversationConfig {
  companyId: string;
  sessionId: string | null;
  ttsEnabled: boolean;
  /** Minimum absolute RMS threshold. Default 0.012 */
  speechThreshold?: number;
  /** Milliseconds of silence before ending a speech segment. Default 2500 */
  silenceDurationMs?: number;
  /** Minimum speech duration (ms) to actually send. Default 600 */
  minSpeechMs?: number;
  /** How many times above noise floor for ONSET. Default 3.0 */
  noiseMultiplierOnset?: number;
  /** How many times above noise floor for OFFSET (lower = stickier). Default 1.8 */
  noiseMultiplierOffset?: number;
}

/* ───────── Helpers ───────── */

/** RMS from time-domain data */
function calcRMS(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

/**
 * Speech Band Energy Ratio: energy in 300–3400 Hz / total energy.
 * Human speech concentrates in this band; music is broader.
 * Returns 0-1 (higher = more likely speech).
 */
function calcSpeechBandRatio(analyser: AnalyserNode, freqBuf: Uint8Array<ArrayBuffer>, sampleRate: number): number {
  analyser.getByteFrequencyData(freqBuf);

  const binCount = analyser.frequencyBinCount;
  const binWidth = sampleRate / (binCount * 2); // Hz per bin

  const loIdx = Math.floor(300 / binWidth);
  const hiIdx = Math.min(Math.ceil(3400 / binWidth), binCount - 1);

  let speechEnergy = 0;
  let totalEnergy = 0;

  for (let i = 0; i < binCount; i++) {
    const e = freqBuf[i] * freqBuf[i]; // squared magnitude
    totalEnergy += e;
    if (i >= loIdx && i <= hiIdx) {
      speechEnergy += e;
    }
  }

  if (totalEnergy === 0) return 0;
  return speechEnergy / totalEnergy;
}

/* ────── Constants ────── */
const CALIBRATION_DURATION_MS = 1500;
const NOISE_EMA_ALPHA = 0.015;       // slow adaptation while listening
const ONSET_HANGOVER_MS = 250;        // sustained energy above onset threshold before speech
const SPEECH_BAND_MIN_RATIO = 0.25;   // at least 25% of energy in speech band to count
const HIGH_PASS_FREQ = 80;            // Hz cutoff for rumble rejection

/* ════════════════ HOOK ════════════════ */
export function useVoiceConversation(
  config: VoiceConversationConfig,
  callbacks: VoiceConversationCallbacks,
) {
  const {
    companyId,
    sessionId,
    ttsEnabled,
    speechThreshold = 0.012,
    silenceDurationMs = 2500,
    minSpeechMs = 600,
    noiseMultiplierOnset = 3.0,
    noiseMultiplierOffset = 1.8,
  } = config;

  /* ── State ── */
  const [state, setState] = useState<ConversationState>('IDLE');
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [dynamicThreshold, setDynamicThreshold] = useState(speechThreshold);

  /* ── Refs ── */
  const stateRef = useRef<ConversationState>('IDLE');
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const vadFrameRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const peakRmsRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(sessionId);

  /* ── Adaptive Noise refs ── */
  const noiseFloorRef = useRef<number>(0);
  const onsetThresholdRef = useRef<number>(speechThreshold);
  const offsetThresholdRef = useRef<number>(speechThreshold);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationStartRef = useRef<number>(0);
  const calibratedRef = useRef<boolean>(false);

  /* ── Onset hangover ref (sustained above-threshold time) ── */
  const onsetAccumRef = useRef<number>(0);     // ms accumulated above onset threshold
  const lastFrameTimeRef = useRef<number>(0);  // for delta-time calculation

  // Keep refs in sync
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  /* ── State setter + mic muting ── */
  const setConvState = useCallback((s: ConversationState) => {
    stateRef.current = s;
    setState(s);
    const stream = streamRef.current;
    if (stream) {
      const shouldMute = s === 'PROCESSING' || s === 'AGENT_SPEAKING';
      stream.getAudioTracks().forEach((t) => { t.enabled = !shouldMute; });
    }
  }, []);

  /** Update noise floor and both thresholds */
  const updateThresholds = useCallback((nf: number) => {
    const onset = Math.max(nf * noiseMultiplierOnset, speechThreshold);
    const offset = Math.max(nf * noiseMultiplierOffset, speechThreshold * 0.8);
    noiseFloorRef.current = nf;
    onsetThresholdRef.current = onset;
    offsetThresholdRef.current = offset;
    setNoiseFloor(nf);
    setDynamicThreshold(onset); // display onset as "threshold"
  }, [noiseMultiplierOnset, noiseMultiplierOffset, speechThreshold]);

  /* ───────────── TTS Playback ───────────── */
  const playTTS = useCallback(async (text: string) => {
    if (!ttsEnabledRef.current) {
      setConvState('LISTENING');
      return;
    }
    try {
      setConvState('AGENT_SPEAKING');
      const blob = await aiService.synthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioPlayerRef.current = null;
        if (stateRef.current === 'AGENT_SPEAKING') setConvState('LISTENING');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioPlayerRef.current = null;
        if (stateRef.current === 'AGENT_SPEAKING') setConvState('LISTENING');
      };
      await audio.play();
    } catch (e) {
      console.error('[VoiceConv] TTS error:', e);
      if (stateRef.current === 'AGENT_SPEAKING') setConvState('LISTENING');
    }
  }, [setConvState]);

  const stopTTS = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
  }, []);

  /* ───────────── Send Audio to Backend ───────────── */
  const sendAudioToBackend = useCallback(async (blob: Blob) => {
    setConvState('PROCESSING');
    callbacksRef.current.onProcessingStage?.('Transcribing...');

    try {
      const transcription = await aiService.transcribe(blob);
      const userText = transcription.text?.trim();

      if (!userText) {
        console.log('[VoiceConv] Empty transcription, returning to listening');
        if (stateRef.current !== 'IDLE') setConvState('LISTENING');
        return;
      }

      callbacksRef.current.onUserMessage(userText);
      callbacksRef.current.onProcessingStage?.('Thinking...');

      const data = await aiService.sendMessage(
        companyIdRef.current,
        { message: userText, session_id: sessionIdRef.current || undefined, input_type: 'voice' },
      );

      if (data.session_id) {
        sessionIdRef.current = data.session_id;
        callbacksRef.current.onSessionId(data.session_id);
      }

      callbacksRef.current.onCallActive(data.call_active);
      callbacksRef.current.onAgentMessage(data.response, data.latency_ms, data.tools_used);

      if (!data.call_active) {
        if (ttsEnabledRef.current) {
          await playTTS(data.response);
          setTimeout(() => setConvState('IDLE'), 500);
        } else {
          setConvState('IDLE');
        }
        return;
      }

      await playTTS(data.response);
    } catch (e: any) {
      console.error('[VoiceConv] Backend error:', e);
      callbacksRef.current.onError('Voice processing failed. Returning to listening...');
      if (stateRef.current !== 'IDLE') setConvState('LISTENING');
    }
  }, [playTTS, setConvState]);

  /* ───────────── VAD Loop (robust) ───────────── */
  const startVADLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const timeBuf = dataArrayRef.current;
    const freqBuf = freqArrayRef.current;
    const sampleRate = audioCtxRef.current?.sampleRate || 48000;
    if (!analyser || !timeBuf || !freqBuf) return;

    lastFrameTimeRef.current = Date.now();

    const loop = () => {
      vadFrameRef.current = requestAnimationFrame(loop);

      const currentState = stateRef.current;
      const now = Date.now();
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      if (
        currentState !== 'CALIBRATING' &&
        currentState !== 'LISTENING' &&
        currentState !== 'USER_SPEAKING'
      ) {
        setAudioLevel(0);
        return;
      }

      const rms = calcRMS(analyser, timeBuf);
      const bandRatio = calcSpeechBandRatio(analyser, freqBuf, sampleRate);
      setAudioLevel(rms);

      /* ── CALIBRATING ── */
      if (currentState === 'CALIBRATING') {
        calibrationSamplesRef.current.push(rms);
        if (now - calibrationStartRef.current >= CALIBRATION_DURATION_MS) {
          const samples = calibrationSamplesRef.current;
          const sorted = [...samples].sort((a, b) => a - b);
          const p75 = sorted[Math.floor(sorted.length * 0.75)] || 0;

          console.log(
            `[VAD] Calibration: ${samples.length} samples, noiseFloor=${p75.toFixed(4)}, ` +
            `onsetTh=${Math.max(p75 * noiseMultiplierOnset, speechThreshold).toFixed(4)}, ` +
            `offsetTh=${Math.max(p75 * noiseMultiplierOffset, speechThreshold * 0.8).toFixed(4)}`,
          );

          updateThresholds(p75);
          calibratedRef.current = true;
          onsetAccumRef.current = 0;
          setConvState('LISTENING');
          callbacksRef.current.onProcessingStage?.('');
        }
        return;
      }

      // Read thresholds
      const onsetTh = onsetThresholdRef.current;
      const offsetTh = offsetThresholdRef.current;

      // Combined speech detection: RMS above threshold AND speech band ratio high enough
      const rmsAboveOnset = rms > onsetTh;
      const rmsAboveOffset = rms > offsetTh;
      const speechLikely = bandRatio >= SPEECH_BAND_MIN_RATIO;

      /* ── LISTENING ── */
      if (currentState === 'LISTENING') {
        // Adapt noise floor slowly (only when not speech-like)
        if (!rmsAboveOffset) {
          const nf = noiseFloorRef.current;
          const newNf = nf * (1 - NOISE_EMA_ALPHA) + rms * NOISE_EMA_ALPHA;
          if (Math.abs(newNf - nf) > 0.0003) {
            updateThresholds(newNf);
          }
          // Reset onset accumulator
          onsetAccumRef.current = 0;
        }

        // Onset detection: RMS above onset threshold + speech band check + hangover
        if (rmsAboveOnset && speechLikely) {
          onsetAccumRef.current += dt;

          if (onsetAccumRef.current >= ONSET_HANGOVER_MS) {
            // Sustained speech detected → start recording
            speechStartTimeRef.current = now;
            lastSpeechTimeRef.current = now;
            peakRmsRef.current = rms;
            setConvState('USER_SPEAKING');

            const stream = streamRef.current;
            if (stream) {
              try {
                audioChunksRef.current = [];
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                  ? 'audio/webm;codecs=opus'
                  : 'audio/webm';
                const recorder = new MediaRecorder(stream, { mimeType });
                mediaRecorderRef.current = recorder;

                recorder.ondataavailable = (e) => {
                  if (e.data.size > 0) audioChunksRef.current.push(e.data);
                };

                recorder.onstop = () => {
                  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                  const speechDuration = Date.now() - speechStartTimeRef.current;
                  const peakRms = peakRmsRef.current;

                  const minPeakRms = onsetThresholdRef.current * 1.1;
                  if (audioBlob.size < 1000 || speechDuration < minSpeechMs || peakRms < minPeakRms) {
                    console.log(
                      `[VAD] Rejected: size=${audioBlob.size}, dur=${speechDuration}ms, ` +
                      `peak=${peakRms.toFixed(4)}, minPeak=${minPeakRms.toFixed(4)}`,
                    );
                    if (stateRef.current !== 'IDLE') setConvState('LISTENING');
                  } else {
                    sendAudioToBackend(audioBlob);
                  }
                };

                recorder.start(100);
              } catch (err) {
                console.error('[VAD] MediaRecorder error:', err);
              }
            }
          }
        } else {
          // Reset onset accumulator if not consistently above threshold
          if (onsetAccumRef.current > 0) {
            onsetAccumRef.current = Math.max(0, onsetAccumRef.current - dt * 2); // decay faster than accumulate
          }
        }
      } else if (currentState === 'USER_SPEAKING') {
        /* ── USER_SPEAKING ── */
        // Use OFFSET threshold (lower, stickier) — hysteresis
        if (rmsAboveOffset) {
          lastSpeechTimeRef.current = now;
          if (rms > peakRmsRef.current) peakRmsRef.current = rms;
        } else {
          const silenceMs = now - lastSpeechTimeRef.current;
          if (silenceMs >= silenceDurationMs) {
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state !== 'inactive'
            ) {
              mediaRecorderRef.current.stop();
              mediaRecorderRef.current = null;
            }
          }
        }
      }
    };

    loop();
  }, [
    speechThreshold, noiseMultiplierOnset, noiseMultiplierOffset,
    silenceDurationMs, minSpeechMs,
    sendAudioToBackend, setConvState, updateThresholds,
  ]);

  /* ───────────── Start Listening ───────────── */
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // ── High-pass filter at 80 Hz (cut bass/rumble) ──
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = HIGH_PASS_FREQ;
      highPass.Q.value = 0.7; // gentle rolloff

      // ── Analyser ──
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.4;

      // Chain: source → highPass → analyser
      source.connect(highPass);
      highPass.connect(analyser);

      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.fftSize);
      freqArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      // Start calibration
      if (!calibratedRef.current) {
        calibrationSamplesRef.current = [];
        calibrationStartRef.current = Date.now();
        setConvState('CALIBRATING');
        callbacksRef.current.onProcessingStage?.('Calibrating ambient noise...');
      } else {
        setConvState('LISTENING');
      }

      startVADLoop();
    } catch (err: any) {
      console.error('[VoiceConv] Mic error:', err);
      if (err.name === 'NotAllowedError') {
        callbacksRef.current.onError('Microphone access denied. Please allow mic access in browser settings.');
      } else {
        callbacksRef.current.onError('Could not access microphone');
      }
    }
  }, [setConvState, startVADLoop]);

  /* ───────────── Stop Listening ───────────── */
  const stopListening = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    stopTTS();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    calibratedRef.current = false;
    onsetAccumRef.current = 0;
    setConvState('IDLE');
    setAudioLevel(0);
  }, [setConvState, stopTTS]);

  /* ───────────── Re-calibrate ───────────── */
  const recalibrate = useCallback(() => {
    if (stateRef.current === 'LISTENING' || stateRef.current === 'CALIBRATING') {
      calibrationSamplesRef.current = [];
      calibrationStartRef.current = Date.now();
      calibratedRef.current = false;
      onsetAccumRef.current = 0;
      setConvState('CALIBRATING');
      callbacksRef.current.onProcessingStage?.('Re-calibrating ambient noise...');
    }
  }, [setConvState]);

  /* ───────────── Barge-in ───────────── */
  const interruptAgent = useCallback(() => {
    if (stateRef.current === 'AGENT_SPEAKING') {
      stopTTS();
      setConvState('LISTENING');
    }
  }, [setConvState, stopTTS]);

  /* ───────────── Cleanup ───────────── */
  useEffect(() => {
    return () => {
      if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      stopTTS();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, [stopTTS]);

  return {
    state,
    audioLevel,
    noiseFloor,
    dynamicThreshold,
    analyser: analyserRef.current,
    startListening,
    stopListening,
    interruptAgent,
    recalibrate,
    stopTTS,
    isIdle: state === 'IDLE',
    isCalibrating: state === 'CALIBRATING',
    isListening: state === 'LISTENING',
    isUserSpeaking: state === 'USER_SPEAKING',
    isProcessing: state === 'PROCESSING',
    isAgentSpeaking: state === 'AGENT_SPEAKING',
  };
}
