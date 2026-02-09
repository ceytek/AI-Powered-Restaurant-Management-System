/**
 * useVoiceConversation — VAD + Turn-Taking State Machine
 *
 * States:
 *   IDLE           → Not in a call
 *   LISTENING      → Mic live, waiting for user speech
 *   USER_SPEAKING  → VAD detected speech, recording audio
 *   PROCESSING     → Speech ended, audio sent to backend
 *   AGENT_SPEAKING → TTS playing agent response
 *
 * Flow:
 *   startListening() → LISTENING
 *     ↓ (voice detected)
 *   USER_SPEAKING
 *     ↓ (silence > threshold)
 *   PROCESSING
 *     ↓ (response + TTS)
 *   AGENT_SPEAKING
 *     ↓ (TTS done)
 *   LISTENING  ← (loop)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { aiService, type VoiceChatResponse } from '@/services/aiService';

/* ───────── Types ───────── */
export type ConversationState =
  | 'IDLE'
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
}

export interface VoiceConversationConfig {
  companyId: string;
  sessionId: string | null;
  ttsEnabled: boolean;
  /** RMS threshold to consider as speech (0‑1). Default 0.015 */
  speechThreshold?: number;
  /** Milliseconds of silence before ending a speech segment. Default 1400 */
  silenceDurationMs?: number;
  /** Minimum speech duration (ms) to actually send. Default 400 */
  minSpeechMs?: number;
}

/* ───────── Helpers ───────── */

/** Calculate RMS (Root Mean Square) energy from frequency data */
function calcRMS(analyser: AnalyserNode, buf: Uint8Array): number {
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
    silenceDurationMs = 1400,
    minSpeechMs = 400,
  } = config;

  /* ── State ── */
  const [state, setState] = useState<ConversationState>('IDLE');
  const [audioLevel, setAudioLevel] = useState(0);

  /* ── Refs (no re-renders) ── */
  const stateRef = useRef<ConversationState>('IDLE');
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const vadFrameRef = useRef<number>(0);
  const speechStartTimeRef = useRef<number>(0);
  const lastSpeechTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(sessionId);

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

  /* ── State setter that also updates ref ── */
  const setConvState = useCallback((s: ConversationState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  /* ───────────── TTS Playback ───────────── */
  const playTTS = useCallback(async (text: string) => {
    if (!ttsEnabledRef.current) {
      // If TTS disabled, go straight back to listening
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
        // After TTS finishes → go back to listening
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
      // Fallback: go to listening even if TTS fails
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

  /* ───────────── Send Audio to Backend ───────────── */
  const sendAudioToBackend = useCallback(async (blob: Blob) => {
    setConvState('PROCESSING');

    try {
      const data: VoiceChatResponse = await aiService.voiceChat(
        blob,
        companyIdRef.current,
        sessionIdRef.current || undefined,
      );

      // Update session
      if (data.session_id) {
        sessionIdRef.current = data.session_id;
        callbacksRef.current.onSessionId(data.session_id);
      }

      callbacksRef.current.onCallActive(data.call_active);

      // Show user transcription
      if (data.transcribed_text) {
        callbacksRef.current.onUserMessage(data.transcribed_text);
      }

      // Show agent response
      callbacksRef.current.onAgentMessage(
        data.text_response,
        data.latency_ms,
        data.tools_used,
      );

      // If call ended
      if (!data.call_active) {
        if (ttsEnabledRef.current) {
          await playTTS(data.text_response);
          // After farewell TTS, stay in AGENT_SPEAKING briefly then stop
          setTimeout(() => setConvState('IDLE'), 500);
        } else {
          setConvState('IDLE');
        }
        return;
      }

      // Play TTS (which will transition to LISTENING after done)
      await playTTS(data.text_response);
    } catch (e: any) {
      console.error('[VoiceConv] Backend error:', e);
      callbacksRef.current.onError('Voice processing failed. Returning to listening...');
      // Recover: go back to listening
      if (stateRef.current !== 'IDLE') {
        setConvState('LISTENING');
      }
    }
  }, [playTTS, setConvState]);

  /* ───────────── VAD Loop (energy-based) ───────────── */
  const startVADLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = dataArrayRef.current;
    if (!analyser || !buf) return;

    const loop = () => {
      vadFrameRef.current = requestAnimationFrame(loop);

      const currentState = stateRef.current;

      // Don't run VAD when not in a listening-capable state
      if (currentState !== 'LISTENING' && currentState !== 'USER_SPEAKING') {
        setAudioLevel(0);
        return;
      }

      const rms = calcRMS(analyser, buf);
      setAudioLevel(rms);

      const now = Date.now();
      const isSpeech = rms > speechThreshold;

      if (currentState === 'LISTENING') {
        if (isSpeech) {
          // Speech detected → start recording
          speechStartTimeRef.current = now;
          lastSpeechTimeRef.current = now;
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

                if (audioBlob.size > 500 && speechDuration >= minSpeechMs) {
                  sendAudioToBackend(audioBlob);
                } else {
                  // Too short → go back to listening
                  console.log('[VoiceConv] Speech too short, ignoring');
                  if (stateRef.current !== 'IDLE') {
                    setConvState('LISTENING');
                  }
                }
              };

              recorder.start(100); // collect data every 100ms
            } catch (err) {
              console.error('[VoiceConv] MediaRecorder error:', err);
            }
          }
        }
      } else if (currentState === 'USER_SPEAKING') {
        if (isSpeech) {
          lastSpeechTimeRef.current = now;
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
            // State transition happens in recorder.onstop
          }
        }
      }
    };

    loop();
  }, [speechThreshold, silenceDurationMs, minSpeechMs, sendAudioToBackend, setConvState]);

  /* ───────────── Start Listening ───────────── */
  const startListening = useCallback(async () => {
    try {
      // Get microphone with echo cancellation
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

      setConvState('LISTENING');

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
    // Cancel VAD loop
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }

    // Stop any ongoing recording
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    // Stop TTS
    stopTTS();

    // Release mic
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Close audio context
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;

    setConvState('IDLE');
    setAudioLevel(0);
  }, [setConvState, stopTTS]);

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
    analyser: analyserRef.current,
    startListening,
    stopListening,
    interruptAgent,
    stopTTS,
    isIdle: state === 'IDLE',
    isListening: state === 'LISTENING',
    isUserSpeaking: state === 'USER_SPEAKING',
    isProcessing: state === 'PROCESSING',
    isAgentSpeaking: state === 'AGENT_SPEAKING',
  };
}
