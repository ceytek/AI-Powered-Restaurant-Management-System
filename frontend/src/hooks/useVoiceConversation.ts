/**
 * useVoiceConversation — Adaptive VAD + Turn-Taking State Machine
 *
 * States:
 *   IDLE           → Not in a call
 *   CALIBRATING    → Measuring ambient noise level (1-2s)
 *   LISTENING      → Mic live, waiting for user speech
 *   USER_SPEAKING  → VAD detected speech, recording audio
 *   PROCESSING     → Speech ended, audio sent to backend
 *   AGENT_SPEAKING → TTS playing agent response
 *
 * Noise Adaptation:
 *   - On first LISTENING, calibrates ambient noise for ~1.5s
 *   - Speech threshold = max(noiseFloor * multiplier, minAbsoluteThreshold)
 *   - Noise floor is continuously updated when LISTENING (slow EMA)
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
  /** Called with processing stage description ("Calibrating…", "Transcribing…", "Thinking…") */
  onProcessingStage?: (stage: string) => void;
}

export interface VoiceConversationConfig {
  companyId: string;
  sessionId: string | null;
  ttsEnabled: boolean;
  /** Minimum absolute RMS threshold (0‑1). Used as floor for adaptive threshold. Default 0.015 */
  speechThreshold?: number;
  /** Milliseconds of silence before ending a speech segment. Default 2500 */
  silenceDurationMs?: number;
  /** Minimum speech duration (ms) to actually send. Default 600 */
  minSpeechMs?: number;
  /** How many times above noise floor to set speech threshold. Default 2.5 */
  noiseMultiplier?: number;
}

/* ───────── Helpers ───────── */

/** Calculate RMS (Root Mean Square) energy from time-domain data */
function calcRMS(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128; // normalize to -1..1
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

/* ════════════════ HOOK ════════════════ */
export function useVoiceConversation(
  config: VoiceConversationConfig,
  callbacks: VoiceConversationCallbacks,
) {
  const {
    companyId,
    sessionId,
    ttsEnabled,
    speechThreshold = 0.015,
    silenceDurationMs = 2500,
    minSpeechMs = 600,
    noiseMultiplier = 2.5,
  } = config;

  /* ── State ── */
  const [state, setState] = useState<ConversationState>('IDLE');
  const [audioLevel, setAudioLevel] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [dynamicThreshold, setDynamicThreshold] = useState(speechThreshold);

  /* ── Refs (no re-renders) ── */
  const stateRef = useRef<ConversationState>('IDLE');
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const vadFrameRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  /** Peak RMS during a recording – used to reject silent clips */
  const peakRmsRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(sessionId);

  /* ── Adaptive Noise Floor refs ── */
  const noiseFloorRef = useRef<number>(0);
  const dynamicThresholdRef = useRef<number>(speechThreshold);
  /** Calibration samples collected during calibration phase */
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationStartRef = useRef<number>(0);
  /** Whether we've done initial calibration for this listening session */
  const calibratedRef = useRef<boolean>(false);
  /** EMA alpha for noise floor adaptation while listening (slow) */
  const NOISE_EMA_ALPHA = 0.02; // very slow adaptation
  /** Duration of calibration phase in ms */
  const CALIBRATION_DURATION_MS = 1500;

  // Keep refs in sync
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;
  const companyIdRef = useRef(companyId);
  companyIdRef.current = companyId;

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /* ── State setter that also updates ref + mic muting ── */
  const setConvState = useCallback((s: ConversationState) => {
    stateRef.current = s;
    setState(s);

    // Mute/unmute mic tracks to prevent echo & accidental captures
    const stream = streamRef.current;
    if (stream) {
      const shouldMute = s === 'PROCESSING' || s === 'AGENT_SPEAKING';
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !shouldMute;
      });
    }
  }, []);

  /** Calculate and apply dynamic threshold from noise floor */
  const updateThreshold = useCallback((nf: number) => {
    const computed = Math.max(nf * noiseMultiplier, speechThreshold);
    dynamicThresholdRef.current = computed;
    noiseFloorRef.current = nf;
    setNoiseFloor(nf);
    setDynamicThreshold(computed);
  }, [noiseMultiplier, speechThreshold]);

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
        if (stateRef.current === 'AGENT_SPEAKING') {
          setConvState('LISTENING');
        }
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioPlayerRef.current = null;
        if (stateRef.current === 'AGENT_SPEAKING') {
          setConvState('LISTENING');
        }
      };

      await audio.play();
    } catch (e) {
      console.error('[VoiceConv] TTS error:', e);
      if (stateRef.current === 'AGENT_SPEAKING') {
        setConvState('LISTENING');
      }
    }
  }, [setConvState]);

  /** Stop TTS immediately (for barge-in) */
  const stopTTS = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
  }, []);

  /* ───────────── Send Audio to Backend (two-step: transcribe → chat) ───────────── */
  const sendAudioToBackend = useCallback(async (blob: Blob) => {
    setConvState('PROCESSING');
    callbacksRef.current.onProcessingStage?.('Transcribing...');

    try {
      // STEP 1: Transcribe audio → show user text immediately
      const transcription = await aiService.transcribe(blob);
      const userText = transcription.text?.trim();

      if (!userText) {
        console.log('[VoiceConv] Empty transcription, returning to listening');
        if (stateRef.current !== 'IDLE') {
          setConvState('LISTENING');
        }
        return;
      }

      // Show the user's words instantly
      callbacksRef.current.onUserMessage(userText);
      callbacksRef.current.onProcessingStage?.('Thinking...');

      // STEP 2: Send text to AI agent
      const data = await aiService.sendMessage(
        companyIdRef.current,
        {
          message: userText,
          session_id: sessionIdRef.current || undefined,
          input_type: 'voice',
        },
      );

      if (data.session_id) {
        sessionIdRef.current = data.session_id;
        callbacksRef.current.onSessionId(data.session_id);
      }

      callbacksRef.current.onCallActive(data.call_active);

      callbacksRef.current.onAgentMessage(
        data.response,
        data.latency_ms,
        data.tools_used,
      );

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
      if (stateRef.current !== 'IDLE') {
        setConvState('LISTENING');
      }
    }
  }, [playTTS, setConvState]);

  /* ───────────── VAD Loop (adaptive noise floor) ───────────── */
  const startVADLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = dataArrayRef.current;
    if (!analyser || !buf) return;

    const loop = () => {
      vadFrameRef.current = requestAnimationFrame(loop);

      const currentState = stateRef.current;

      // Don't run VAD when not in a listening-capable state
      if (
        currentState !== 'CALIBRATING' &&
        currentState !== 'LISTENING' &&
        currentState !== 'USER_SPEAKING'
      ) {
        setAudioLevel(0);
        return;
      }

      const rms = calcRMS(analyser, buf);
      setAudioLevel(rms);

      const now = Date.now();

      /* ── CALIBRATING: measure ambient noise ── */
      if (currentState === 'CALIBRATING') {
        calibrationSamplesRef.current.push(rms);

        const elapsed = now - calibrationStartRef.current;
        if (elapsed >= CALIBRATION_DURATION_MS) {
          // Compute noise floor from calibration samples
          const samples = calibrationSamplesRef.current;
          // Use the 75th percentile (to ignore occasional transient peaks)
          const sorted = [...samples].sort((a, b) => a - b);
          const p75idx = Math.floor(sorted.length * 0.75);
          const measuredFloor = sorted[p75idx] || 0;

          console.log(
            `[VoiceConv] Calibration done: ${samples.length} samples, ` +
            `noise floor = ${measuredFloor.toFixed(4)}, ` +
            `dynamic threshold = ${Math.max(measuredFloor * noiseMultiplier, speechThreshold).toFixed(4)}`,
          );

          updateThreshold(measuredFloor);
          calibratedRef.current = true;
          setConvState('LISTENING');
          callbacksRef.current.onProcessingStage?.('');
        }
        return;
      }

      // Use dynamic threshold
      const threshold = dynamicThresholdRef.current;
      const isSpeech = rms > threshold;

      /* ── LISTENING ── */
      if (currentState === 'LISTENING') {
        // Slowly adapt noise floor while listening (only when not speech)
        if (!isSpeech) {
          const nf = noiseFloorRef.current;
          const newNf = nf * (1 - NOISE_EMA_ALPHA) + rms * NOISE_EMA_ALPHA;
          // Only update if the change is meaningful (avoid constant re-renders)
          if (Math.abs(newNf - nf) > 0.0005) {
            updateThreshold(newNf);
          }
        }

        if (isSpeech) {
          // Speech detected → start recording
          speechStartTimeRef.current = now;
          lastSpeechTimeRef.current = now;
          peakRmsRef.current = rms;
          setConvState('USER_SPEAKING');

          // Start MediaRecorder
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

                // Reject: too short, too small, or peak not significantly above noise
                const minPeakRms = dynamicThresholdRef.current * 1.2;
                if (audioBlob.size < 1000 || speechDuration < minSpeechMs || peakRms < minPeakRms) {
                  console.log(
                    `[VoiceConv] Rejected: size=${audioBlob.size}, dur=${speechDuration}ms, ` +
                    `peak=${peakRms.toFixed(4)}, minPeak=${minPeakRms.toFixed(4)}`,
                  );
                  if (stateRef.current !== 'IDLE') {
                    setConvState('LISTENING');
                  }
                } else {
                  sendAudioToBackend(audioBlob);
                }
              };

              recorder.start(100);
            } catch (err) {
              console.error('[VoiceConv] MediaRecorder error:', err);
            }
          }
        }
      } else if (currentState === 'USER_SPEAKING') {
        /* ── USER_SPEAKING ── */
        if (isSpeech) {
          lastSpeechTimeRef.current = now;
          if (rms > peakRmsRef.current) peakRmsRef.current = rms;
        } else {
          // Check if silence long enough
          const silenceMs = now - lastSpeechTimeRef.current;
          if (silenceMs >= silenceDurationMs) {
            // End of speech → stop recording
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
  }, [speechThreshold, noiseMultiplier, silenceDurationMs, minSpeechMs, sendAudioToBackend, setConvState, updateThreshold]);

  /* ───────────── Start Listening ───────────── */
  const startListening = useCallback(async () => {
    try {
      // Get microphone with noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Setup audio context & analyser
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.fftSize);

      // Start with calibration phase if not already calibrated
      if (!calibratedRef.current) {
        calibrationSamplesRef.current = [];
        calibrationStartRef.current = Date.now();
        setConvState('CALIBRATING');
        callbacksRef.current.onProcessingStage?.('Calibrating ambient noise...');
      } else {
        setConvState('LISTENING');
      }

      // Start the VAD loop
      startVADLoop();
    } catch (err: any) {
      console.error('[VoiceConv] Mic error:', err);
      if (err.name === 'NotAllowedError') {
        callbacksRef.current.onError(
          'Microphone access denied. Please allow mic access in browser settings.',
        );
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

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    stopTTS();

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;

    // Reset calibration for next session
    calibratedRef.current = false;

    setConvState('IDLE');
    setAudioLevel(0);
  }, [setConvState, stopTTS]);

  /* ───────────── Re-calibrate (manual trigger) ───────────── */
  const recalibrate = useCallback(() => {
    if (stateRef.current === 'LISTENING' || stateRef.current === 'CALIBRATING') {
      calibrationSamplesRef.current = [];
      calibrationStartRef.current = Date.now();
      calibratedRef.current = false;
      setConvState('CALIBRATING');
      callbacksRef.current.onProcessingStage?.('Re-calibrating ambient noise...');
    }
  }, [setConvState]);

  /* ───────────── Barge-in (Interrupt Agent) ───────────── */
  const interruptAgent = useCallback(() => {
    if (stateRef.current === 'AGENT_SPEAKING') {
      stopTTS();
      setConvState('LISTENING');
    }
  }, [setConvState, stopTTS]);

  /* ───────────── Cleanup on unmount ───────────── */
  useEffect(() => {
    return () => {
      if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== 'inactive'
      ) {
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
