/**
 * useVoiceConversation — Production-grade VAD + Turn-Taking
 *
 * STATES:
 *   IDLE           → Not in a call
 *   CALIBRATING    → Measuring ambient noise (~1.5s)
 *   LISTENING      → Mic live, waiting for speech
 *   USER_SPEAKING  → Detected speech, recording
 *   PROCESSING     → Speech ended, sending to backend
 *   AGENT_SPEAKING → Playing TTS response
 *
 * KEY VAD FEATURES:
 *   1. Adaptive noise floor (calibration + EMA)
 *   2. Hysteresis: onset threshold > offset threshold
 *   3. Onset hangover: sustained above-threshold before trigger
 *   4. Speech band energy ratio (300–3400 Hz) — rejects music/broadband noise
 *   5. High-pass filter at 100 Hz (bass/rumble rejection)
 *   6. *** RELATIVE ENERGY DROP *** — tracks user's speaking level,
 *      detects when energy drops >50% from their speaking average
 *      even if ambient noise keeps absolute RMS high.
 *   7. Adaptive silence duration — faster cutoff when clearly non-speech
 *   8. Max speech duration timeout — 15s safety valve
 *   9. Energy trend detection — falling energy = user stopped
 *  10. Peak RMS gating on final audio blob
 *  11. Manual "Done Speaking" button — immediate finalize
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
  /** Provide last agent message for Whisper context hinting */
  getLastAgentMessage?: () => string | undefined;
}

export interface VoiceConversationConfig {
  companyId: string;
  sessionId: string | null;
  ttsEnabled: boolean;
  /** Absolute minimum speech threshold. Default 0.012 */
  speechThreshold?: number;
  /** Max silence (ms) before ending speech segment. Default 2000 */
  silenceDurationMs?: number;
  /** Minimum speech length to send (ms). Default 500 */
  minSpeechMs?: number;
  /** Multiplier for onset threshold. Default 3.5 */
  noiseMultiplierOnset?: number;
  /** Multiplier for offset threshold (lower = stickier). Default 2.0 */
  noiseMultiplierOffset?: number;
}

/* ───────── Audio Helpers ───────── */

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
 * Speech Band Energy Ratio: energy in 300–3400 Hz / total.
 * Human speech is concentrated here; music/noise is broader.
 * Returns 0..1 (higher = more speech-like).
 */
function calcSpeechBandRatio(analyser: AnalyserNode, freqBuf: Uint8Array<ArrayBuffer>, sampleRate: number): number {
  analyser.getByteFrequencyData(freqBuf);
  const binCount = analyser.frequencyBinCount;
  const binWidth = sampleRate / (binCount * 2);
  const loIdx = Math.floor(300 / binWidth);
  const hiIdx = Math.min(Math.ceil(3400 / binWidth), binCount - 1);

  let speechEnergy = 0;
  let totalEnergy = 0;
  for (let i = 0; i < binCount; i++) {
    const e = freqBuf[i] * freqBuf[i];
    totalEnergy += e;
    if (i >= loIdx && i <= hiIdx) speechEnergy += e;
  }
  return totalEnergy === 0 ? 0 : speechEnergy / totalEnergy;
}

/* ────── Tuning Constants ────── */
const CALIBRATION_MS           = 1500;    // Calibration window
const NOISE_EMA_ALPHA          = 0.012;   // Slow noise floor adaptation
const ONSET_HANGOVER_MS        = 250;     // Must sustain above onset threshold
const SPEECH_BAND_MIN_ONSET    = 0.28;    // Band ratio minimum for onset (stricter)
const SPEECH_BAND_MIN_OFFSET   = 0.20;    // Band ratio minimum for offset (looser)
const HIGH_PASS_FREQ           = 100;     // Hz cutoff
const MAX_SPEECH_DURATION_MS   = 15000;   // 15s safety cap
const ENERGY_TREND_WINDOW      = 10;      // Frames to track for energy trend

// ★ Relative energy drop detection
const SPEECH_ENERGY_EMA        = 0.15;    // How fast we track user's speech energy
const RELATIVE_DROP_FACTOR     = 0.45;    // If current < 45% of speech avg → "dropped"
const RELATIVE_DROP_SILENCE_MS = 600;     // After drop, wait this long then finalize

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
    silenceDurationMs = 2000,
    minSpeechMs = 500,
    noiseMultiplierOnset = 3.5,
    noiseMultiplierOffset = 2.0,
  } = config;

  /* ── State ── */
  const [state, setState] = useState<ConversationState>('IDLE');
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [dynamicThreshold, setDynamicThreshold] = useState(speechThreshold);
  const [speechBandRatio, setSpeechBandRatio] = useState(0);

  /* ── Refs: Hardware ── */
  const stateRef = useRef<ConversationState>('IDLE');
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  /* ── Refs: VAD timing ── */
  const vadFrameRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const peakRmsRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(sessionId);
  const lastFrameTimeRef = useRef<number>(0);

  /* ── Refs: Adaptive noise ── */
  const noiseFloorRef = useRef<number>(0);
  const onsetThresholdRef = useRef<number>(speechThreshold);
  const offsetThresholdRef = useRef<number>(speechThreshold);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationStartRef = useRef<number>(0);
  const calibratedRef = useRef<boolean>(false);

  /* ── Refs: Onset hangover ── */
  const onsetAccumRef = useRef<number>(0);

  /* ── Refs: Energy trend (detect falling energy) ── */
  const energyHistoryRef = useRef<number[]>([]);

  /* ── ★ Refs: Relative energy drop ── */
  const speechEnergyAvgRef = useRef<number>(0);   // EMA of user's speaking RMS
  const energyDropTimeRef = useRef<number>(0);     // When we first detected the drop

  /* ── Keep in sync ── */
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

  /** Update noise floor → recompute both thresholds */
  const updateThresholds = useCallback((nf: number) => {
    const onset = Math.max(nf * noiseMultiplierOnset, speechThreshold);
    const offset = Math.max(nf * noiseMultiplierOffset, speechThreshold * 0.75);
    noiseFloorRef.current = nf;
    onsetThresholdRef.current = onset;
    offsetThresholdRef.current = offset;
    setNoiseFloor(nf);
    setDynamicThreshold(onset);
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
      // Pass last agent message as context hint to Whisper
      const contextHint = callbacksRef.current.getLastAgentMessage?.();
      const transcription = await aiService.transcribe(blob, 'recording.webm', contextHint);
      const userText = transcription.text?.trim();
      if (!userText) {
        console.log('[VoiceConv] Empty transcription → back to listening');
        if (stateRef.current !== 'IDLE') setConvState('LISTENING');
        return;
      }

      callbacksRef.current.onUserMessage(userText);
      callbacksRef.current.onProcessingStage?.('Thinking...');

      const data = await aiService.sendMessage(companyIdRef.current, {
        message: userText,
        session_id: sessionIdRef.current || undefined,
        input_type: 'voice',
      });

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
      callbacksRef.current.onError('Voice processing failed.');
      if (stateRef.current !== 'IDLE') setConvState('LISTENING');
    }
  }, [playTTS, setConvState]);

  /* ─── Helper: stop recording & trigger send ─── */
  const finalizeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  /* ─── Public: manual "Done Speaking" button ─── */
  const finishSpeaking = useCallback(() => {
    if (stateRef.current === 'USER_SPEAKING') {
      console.log('[VAD] Manual finish speaking triggered');
      finalizeRecording();
    }
  }, [finalizeRecording]);

  /* ───────────── VAD Loop ───────────── */
  const startVADLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const timeBuf = dataArrayRef.current;
    const freqBuf = freqArrayRef.current;
    const sampleRate = audioCtxRef.current?.sampleRate || 48000;
    if (!analyser || !timeBuf || !freqBuf) return;

    lastFrameTimeRef.current = Date.now();
    energyHistoryRef.current = [];

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
      setSpeechBandRatio(bandRatio);

      /* ════ CALIBRATING ════ */
      if (currentState === 'CALIBRATING') {
        calibrationSamplesRef.current.push(rms);
        if (now - calibrationStartRef.current >= CALIBRATION_MS) {
          const sorted = [...calibrationSamplesRef.current].sort((a, b) => a - b);
          const p75 = sorted[Math.floor(sorted.length * 0.75)] || 0;
          console.log(
            `[VAD] Calibrated: samples=${sorted.length}, noise=${p75.toFixed(4)}, ` +
            `onset=${Math.max(p75 * noiseMultiplierOnset, speechThreshold).toFixed(4)}, ` +
            `offset=${Math.max(p75 * noiseMultiplierOffset, speechThreshold * 0.75).toFixed(4)}`,
          );
          updateThresholds(p75);
          calibratedRef.current = true;
          onsetAccumRef.current = 0;
          energyHistoryRef.current = [];
          speechEnergyAvgRef.current = 0;
          energyDropTimeRef.current = 0;
          setConvState('LISTENING');
          callbacksRef.current.onProcessingStage?.('');
        }
        return;
      }

      const onsetTh = onsetThresholdRef.current;
      const offsetTh = offsetThresholdRef.current;

      /* ════ LISTENING ════ */
      if (currentState === 'LISTENING') {
        // Adapt noise floor slowly (only during non-speech)
        if (rms <= offsetTh) {
          const nf = noiseFloorRef.current;
          const newNf = nf * (1 - NOISE_EMA_ALPHA) + rms * NOISE_EMA_ALPHA;
          if (Math.abs(newNf - nf) > 0.0002) updateThresholds(newNf);
          onsetAccumRef.current = 0;
        }

        // Onset detection: RMS > onset AND speech band check AND hangover
        const rmsAboveOnset = rms > onsetTh;
        const speechLikely = bandRatio >= SPEECH_BAND_MIN_ONSET;

        if (rmsAboveOnset && speechLikely) {
          onsetAccumRef.current += dt;
          if (onsetAccumRef.current >= ONSET_HANGOVER_MS) {
            // ✅ Confirmed speech → start recording
            speechStartTimeRef.current = now;
            lastSpeechTimeRef.current = now;
            peakRmsRef.current = rms;
            energyHistoryRef.current = [rms];
            speechEnergyAvgRef.current = rms;  // ★ Initialize speech energy tracker
            energyDropTimeRef.current = 0;      // ★ Reset drop timer
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
                  const minPeakRms = onsetThresholdRef.current * 1.05;

                  if (audioBlob.size < 1000 || speechDuration < minSpeechMs || peakRms < minPeakRms) {
                    console.log(
                      `[VAD] Rejected: size=${audioBlob.size}, dur=${speechDuration}ms, ` +
                      `peak=${peakRms.toFixed(4)}, min=${minPeakRms.toFixed(4)}`,
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
          // Decay onset accumulator (2× faster than build-up)
          if (onsetAccumRef.current > 0) {
            onsetAccumRef.current = Math.max(0, onsetAccumRef.current - dt * 2);
          }
        }

      /* ════ USER_SPEAKING ════ */
      } else if (currentState === 'USER_SPEAKING') {
        // Track energy trend
        const hist = energyHistoryRef.current;
        hist.push(rms);
        if (hist.length > ENERGY_TREND_WINDOW) hist.shift();

        if (rms > peakRmsRef.current) peakRmsRef.current = rms;

        // ★ RELATIVE ENERGY DROP DETECTION
        // Track the user's average speaking energy with EMA.
        // When energy drops to <45% of their speech average, they likely stopped.
        const speechAvg = speechEnergyAvgRef.current;

        // Only update speech average when RMS is high (user is actually speaking)
        const rmsAboveOffset = rms > offsetTh;
        const bandIsSpeechLike = bandRatio >= SPEECH_BAND_MIN_OFFSET;
        const stillSpeaking = rmsAboveOffset && bandIsSpeechLike;

        if (stillSpeaking) {
          // Update speech energy average (only when user is clearly speaking)
          speechEnergyAvgRef.current = speechAvg * (1 - SPEECH_ENERGY_EMA) + rms * SPEECH_ENERGY_EMA;
          lastSpeechTimeRef.current = now;
          energyDropTimeRef.current = 0; // Reset drop timer
        }

        const silenceMs = now - lastSpeechTimeRef.current;

        // ★★★ RELATIVE DROP CHECK ★★★
        // If energy has dropped to < 45% of user's speaking average,
        // they likely stopped — even if café noise keeps absolute RMS above offset.
        const relativelyDropped = speechAvg > 0 && rms < speechAvg * RELATIVE_DROP_FACTOR;

        if (relativelyDropped) {
          if (energyDropTimeRef.current === 0) {
            energyDropTimeRef.current = now;
            console.log(
              `[VAD] ★ Energy drop detected: rms=${rms.toFixed(4)} < ${(speechAvg * RELATIVE_DROP_FACTOR).toFixed(4)} ` +
              `(${(RELATIVE_DROP_FACTOR * 100).toFixed(0)}% of avg=${speechAvg.toFixed(4)})`,
            );
          }
          const dropDuration = now - energyDropTimeRef.current;
          if (dropDuration >= RELATIVE_DROP_SILENCE_MS) {
            console.log(`[VAD] ★ Relative energy drop sustained ${dropDuration}ms → end speech`);
            finalizeRecording();
            return;
          }
        } else {
          // Energy came back up — reset drop timer
          if (energyDropTimeRef.current > 0 && stillSpeaking) {
            energyDropTimeRef.current = 0;
          }
        }

        // Adaptive silence duration based on band ratio
        let effectiveSilenceDuration = silenceDurationMs;
        if (bandRatio < 0.15) {
          // Clearly non-speech (music/broadband) → cut silence wait
          effectiveSilenceDuration = silenceDurationMs * 0.4;
        } else if (bandRatio < SPEECH_BAND_MIN_OFFSET) {
          effectiveSilenceDuration = silenceDurationMs * 0.65;
        }

        // Energy trend: if energy has been declining steadily, user likely stopped
        let energyFalling = false;
        if (hist.length >= ENERGY_TREND_WINDOW) {
          const firstHalf = hist.slice(0, Math.floor(hist.length / 2));
          const secondHalf = hist.slice(Math.floor(hist.length / 2));
          const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          if (avg2 < avg1 * 0.55 && avg2 < offsetTh * 1.2) {
            energyFalling = true;
          }
        }

        // If energy is falling AND some silence accumulated → end speech
        if (energyFalling && silenceMs >= effectiveSilenceDuration * 0.5) {
          console.log(`[VAD] Energy falling + partial silence → end speech (${silenceMs}ms)`);
          finalizeRecording();
        }
        // Standard silence check
        else if (silenceMs >= effectiveSilenceDuration) {
          console.log(
            `[VAD] Silence ${silenceMs}ms >= ${effectiveSilenceDuration.toFixed(0)}ms → end speech ` +
            `(band=${bandRatio.toFixed(3)}, rms=${rms.toFixed(4)})`,
          );
          finalizeRecording();
        }

        // Max speech duration safety valve
        const speechDur = now - speechStartTimeRef.current;
        if (speechDur > MAX_SPEECH_DURATION_MS) {
          console.log(`[VAD] Max speech duration ${MAX_SPEECH_DURATION_MS}ms exceeded → force end`);
          finalizeRecording();
        }
      }
    };

    loop();
  }, [
    speechThreshold, noiseMultiplierOnset, noiseMultiplierOffset,
    silenceDurationMs, minSpeechMs,
    sendAudioToBackend, setConvState, updateThresholds, finalizeRecording,
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

      // High-pass filter: cut bass/rumble (100 Hz)
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = HIGH_PASS_FREQ;
      highPass.Q.value = 0.7;

      // Analyser
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;

      // Chain: source → highPass → analyser
      source.connect(highPass);
      highPass.connect(analyser);

      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.fftSize);
      freqArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

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
        callbacksRef.current.onError('Microphone access denied.');
      } else {
        callbacksRef.current.onError('Could not access microphone');
      }
    }
  }, [setConvState, startVADLoop]);

  /* ───────────── Stop ───────────── */
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
    energyHistoryRef.current = [];
    speechEnergyAvgRef.current = 0;
    energyDropTimeRef.current = 0;
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
      energyHistoryRef.current = [];
      speechEnergyAvgRef.current = 0;
      energyDropTimeRef.current = 0;
      setConvState('CALIBRATING');
      callbacksRef.current.onProcessingStage?.('Re-calibrating...');
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
    speechBandRatio,
    analyser: analyserRef.current,
    startListening,
    stopListening,
    interruptAgent,
    recalibrate,
    finishSpeaking,
    stopTTS,
    isIdle: state === 'IDLE',
    isCalibrating: state === 'CALIBRATING',
    isListening: state === 'LISTENING',
    isUserSpeaking: state === 'USER_SPEAKING',
    isProcessing: state === 'PROCESSING',
    isAgentSpeaking: state === 'AGENT_SPEAKING',
  };
}
