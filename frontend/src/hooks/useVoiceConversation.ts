/**
 * useVoiceConversation — Production-grade VAD + Turn-Taking
 *
 * KEY INSIGHT for noisy environments (café, restaurant):
 * In a café, other people talking also has speech-band energy,
 * so band-ratio alone can't distinguish "user stopped" from "others talking".
 *
 * SOLUTION: PEAK-BASED RELATIVE DROP
 * - Track the PEAK RMS while user is speaking
 * - When RMS drops below 50% of PEAK for 700ms → user stopped
 * - Peak never decays → always represents the user's actual voice level
 * - Works because user's voice is much louder than ambient (near-field mic)
 *
 * STATES:
 *   IDLE → CALIBRATING → LISTENING → USER_SPEAKING → PROCESSING → AGENT_SPEAKING → LISTENING
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
  getLastAgentMessage?: () => string | undefined;
}

export interface VoiceConversationConfig {
  companyId: string;
  sessionId: string | null;
  ttsEnabled: boolean;
  speechThreshold?: number;
  silenceDurationMs?: number;
  minSpeechMs?: number;
  noiseMultiplierOnset?: number;
  noiseMultiplierOffset?: number;
}

/* ───────── Audio Helpers ───────── */

function calcRMS(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

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
const CALIBRATION_MS         = 1500;
const NOISE_EMA_ALPHA        = 0.012;
const ONSET_HANGOVER_MS      = 250;
const SPEECH_BAND_MIN_ONSET  = 0.28;
const HIGH_PASS_FREQ         = 100;
const MAX_SPEECH_DURATION_MS = 15000;

// ★★★ PEAK-BASED DROP DETECTION (the key mechanism) ★★★
// If current RMS drops below PEAK_DROP_RATIO of the user's peak → "dropped"
const PEAK_DROP_RATIO        = 0.50;   // <50% of peak = user stopped
const PEAK_DROP_CONFIRM_MS   = 700;    // Must sustain 700ms to confirm
const PEAK_RECOVERY_RATIO    = 0.65;   // Must rise back to 65% of peak to cancel drop

// Absolute silence fallback (in case peak detection doesn't trigger)
const ABSOLUTE_SILENCE_MS    = 1500;   // Hard timeout: no speech-like signal for 1.5s

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
    silenceDurationMs = 1500,
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

  /* ── ★ Refs: Peak-based drop detection ── */
  const dropStartTimeRef = useRef<number>(0);  // When drop was first detected (0 = not in drop)

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
            `onset=${Math.max(p75 * noiseMultiplierOnset, speechThreshold).toFixed(4)}`,
          );
          updateThresholds(p75);
          calibratedRef.current = true;
          onsetAccumRef.current = 0;
          dropStartTimeRef.current = 0;
          setConvState('LISTENING');
          callbacksRef.current.onProcessingStage?.('');
        }
        return;
      }

      const onsetTh = onsetThresholdRef.current;
      const offsetTh = offsetThresholdRef.current;

      /* ════ LISTENING ════ */
      if (currentState === 'LISTENING') {
        // Adapt noise floor slowly
        if (rms <= offsetTh) {
          const nf = noiseFloorRef.current;
          const newNf = nf * (1 - NOISE_EMA_ALPHA) + rms * NOISE_EMA_ALPHA;
          if (Math.abs(newNf - nf) > 0.0002) updateThresholds(newNf);
          onsetAccumRef.current = 0;
        }

        // Onset: RMS > onset AND speech band AND hangover
        const rmsAboveOnset = rms > onsetTh;
        const speechLikely = bandRatio >= SPEECH_BAND_MIN_ONSET;

        if (rmsAboveOnset && speechLikely) {
          onsetAccumRef.current += dt;
          if (onsetAccumRef.current >= ONSET_HANGOVER_MS) {
            speechStartTimeRef.current = now;
            lastSpeechTimeRef.current = now;
            peakRmsRef.current = rms;
            dropStartTimeRef.current = 0;
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
          if (onsetAccumRef.current > 0) {
            onsetAccumRef.current = Math.max(0, onsetAccumRef.current - dt * 2);
          }
        }

      /* ════ USER_SPEAKING ════ */
      } else if (currentState === 'USER_SPEAKING') {
        // Track peak RMS (only goes up, never down)
        if (rms > peakRmsRef.current) {
          peakRmsRef.current = rms;
        }

        const peak = peakRmsRef.current;
        const dropThreshold = peak * PEAK_DROP_RATIO;
        const recoveryThreshold = peak * PEAK_RECOVERY_RATIO;

        // ★★★ PEAK-BASED DROP DETECTION ★★★
        // If current RMS < 50% of user's PEAK speaking level → they likely stopped.
        // Peak is fixed (only goes up) so café ambient can't drag it down.
        // User speaks at 0.08 peak → stops → café at 0.03 < 0.04 (50% of 0.08) → DROP
        const dropped = rms < dropThreshold;

        if (dropped) {
          // Start or continue drop timer
          if (dropStartTimeRef.current === 0) {
            dropStartTimeRef.current = now;
            console.log(
              `[VAD] ★ Peak drop: rms=${rms.toFixed(4)} < ${dropThreshold.toFixed(4)} ` +
              `(50% of peak=${peak.toFixed(4)})`,
            );
          }
          const dropDuration = now - dropStartTimeRef.current;
          if (dropDuration >= PEAK_DROP_CONFIRM_MS) {
            console.log(`[VAD] ★ Peak drop confirmed after ${dropDuration}ms → END SPEECH`);
            finalizeRecording();
            return;
          }
        } else if (rms >= recoveryThreshold) {
          // Energy recovered to near peak → user is speaking again
          if (dropStartTimeRef.current > 0) {
            console.log(`[VAD] Drop cancelled: rms=${rms.toFixed(4)} recovered to >${recoveryThreshold.toFixed(4)}`);
          }
          dropStartTimeRef.current = 0;
          lastSpeechTimeRef.current = now;
        }
        // In between (50%..65% of peak): don't update either timer
        // This prevents brief café noise spikes from resetting the drop

        // ─── ABSOLUTE SILENCE FALLBACK ───
        // If nothing speech-like for ABSOLUTE_SILENCE_MS (regardless of peak)
        const offsetAbove = rms > offsetTh;
        const speechBand = bandRatio >= 0.20;
        if (offsetAbove && speechBand) {
          lastSpeechTimeRef.current = now;
        }
        const absoluteSilence = now - lastSpeechTimeRef.current;
        if (absoluteSilence >= ABSOLUTE_SILENCE_MS) {
          console.log(`[VAD] Absolute silence ${absoluteSilence}ms → END SPEECH`);
          finalizeRecording();
          return;
        }

        // ─── MAX DURATION SAFETY VALVE ───
        const speechDur = now - speechStartTimeRef.current;
        if (speechDur > MAX_SPEECH_DURATION_MS) {
          console.log(`[VAD] Max speech ${MAX_SPEECH_DURATION_MS}ms → force END`);
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

      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = HIGH_PASS_FREQ;
      highPass.Q.value = 0.7;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;

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
    dropStartTimeRef.current = 0;
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
      dropStartTimeRef.current = 0;
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
