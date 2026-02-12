import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  aiService,
  type ChatResponse,
  type MessageInfo,
  type SessionInfo,
  type VoiceChatResponse,
} from '@/services/aiService';
import { useAuthStore } from '@/store/authStore';
import { useVoiceConversation, type ConversationState } from '@/hooks/useVoiceConversation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Phone,
  PhoneOff,
  Send,
  Mic,
  MicOff,
  User,
  Bot,
  Clock,
  Wrench,
  MessageCircle,
  History,
  Loader2,
  Volume2,
  VolumeX,
  PhoneCall,
  Keyboard,
  AudioLines,
  CircleStop,
  Info,
  Radio,
  Hand,
  Settings2,
  Ear,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ───────────────── Types ───────────────── */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  latency_ms?: number;
  tools_used?: string[];
  isVoice?: boolean;
}

type InteractionMode = 'live' | 'ptt' | 'text';

/* ───────────── Audio Level Meter ───────────── */
function AudioLevelMeter({ level, isActive }: { level: number; isActive: boolean }) {
  const bars = 20;
  const normalised = Math.min(level * 12, 1); // amplify for visual

  return (
    <div className="flex items-end gap-[2px] h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = i / bars;
        const active = isActive && normalised > threshold;
        return (
          <div
            key={i}
            className={cn(
              'w-1 rounded-full transition-all duration-75',
              active
                ? i / bars > 0.7
                  ? 'bg-red-400'
                  : i / bars > 0.4
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                : 'bg-muted-foreground/15',
            )}
            style={{
              height: active
                ? `${Math.max(4, (normalised - threshold) * 60 + 6)}px`
                : '4px',
            }}
          />
        );
      })}
    </div>
  );
}

/* ───────────── Live Waveform ───────────── */
function LiveWaveform({ analyser, isActive }: { analyser: AnalyserNode | null; isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current || !isActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [analyser, isActive]);

  return <canvas ref={canvasRef} width={280} height={50} className="w-full max-w-[280px]" />;
}

/* ──────────── Incoming Call Overlay ──────────── */
function IncomingCallOverlay({
  onAnswer,
  onDecline,
  restaurantName,
}: {
  onAnswer: () => void;
  onDecline: () => void;
  restaurantName: string;
}) {
  const callerProfiles = [
    { name: 'Sarah Mitchell', phone: '+1 (212) 555-0187', avatar: 'SM', tags: ['Returning Guest', 'Regular'], visits: 12, avgSpent: 85.5 },
    { name: 'James Rodriguez', phone: '+1 (646) 555-0234', avatar: 'JR', tags: ['VIP', 'High Spender', 'Regular'], visits: 28, avgSpent: 142.0 },
    { name: 'Emily Chen', phone: '+1 (917) 555-0391', avatar: 'EC', tags: ['New Caller'], visits: 0, avgSpent: 0 },
    { name: 'Michael Thompson', phone: '+1 (347) 555-0145', avatar: 'MT', tags: ['Returning Guest'], visits: 5, avgSpent: 67.0 },
    { name: 'Unknown Caller', phone: '+1 (555) 019-2847', avatar: '?', tags: [], visits: 0, avgSpent: 0 },
    { name: 'Olivia Parker', phone: '+1 (718) 555-0276', avatar: 'OP', tags: ['VIP', 'Birthday This Month'], visits: 18, avgSpent: 110.5 },
  ];

  const [caller] = useState(() => callerProfiles[Math.floor(Math.random() * callerProfiles.length)]);
  const [ringCount, setRingCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setRingCount((p) => p + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const tagColors: Record<string, string> = {
    'VIP': 'bg-amber-500/90 text-white',
    'High Spender': 'bg-emerald-500/90 text-white',
    'Regular': 'bg-blue-500/90 text-white',
    'Returning Guest': 'bg-purple-500/90 text-white',
    'New Caller': 'bg-slate-500/90 text-white',
    'Birthday This Month': 'bg-pink-500/90 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-sm mx-4">
        {/* Ringing pulse behind card */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-80 h-80 rounded-full border-2 border-emerald-400/20 animate-ping" />
          <div className="absolute w-96 h-96 rounded-full border border-emerald-400/10 animate-ping" style={{ animationDelay: '0.7s' }} />
        </div>

        {/* Card */}
        <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden border border-white/10">
          {/* Top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />

          {/* Content */}
          <div className="px-6 pt-8 pb-6 text-center">
            {/* Incoming Call Label */}
            <p className="text-emerald-400 text-xs font-medium tracking-widest uppercase mb-6 animate-pulse">
              Incoming Call
            </p>

            {/* Avatar */}
            <div className="relative mx-auto w-24 h-24 mb-5">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 animate-pulse" />
              <div className="absolute inset-[3px] rounded-full bg-slate-700 flex items-center justify-center">
                {caller.avatar === '?' ? (
                  <User className="h-10 w-10 text-slate-400" />
                ) : (
                  <span className="text-2xl font-bold text-white">{caller.avatar}</span>
                )}
              </div>
              {/* Online indicator */}
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-4 border-slate-800 animate-pulse" />
            </div>

            {/* Name */}
            <h2 className="text-white text-xl font-bold mb-1">{caller.name}</h2>
            <p className="text-slate-400 text-sm mb-4">{caller.phone}</p>

            {/* Tags */}
            {caller.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {caller.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      'px-3 py-1 rounded-full text-[11px] font-semibold',
                      tagColors[tag] || 'bg-slate-600 text-white',
                    )}
                  >
                    {tag}
                  </span>
                ))}
                {caller.visits > 0 && (
                  <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-600/80 text-white">
                    {caller.visits} visits
                  </span>
                )}
              </div>
            )}

            {/* Stats Row */}
            {caller.visits > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-6 px-2">
                <div className="bg-slate-700/50 rounded-xl py-2.5 px-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Visits</p>
                  <p className="text-white font-bold text-sm">{caller.visits}</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl py-2.5 px-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Avg Spent</p>
                  <p className="text-white font-bold text-sm">${caller.avgSpent.toFixed(0)}</p>
                </div>
                <div className="bg-slate-700/50 rounded-xl py-2.5 px-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Ring</p>
                  <p className="text-white font-bold text-sm">{ringCount}s</p>
                </div>
              </div>
            )}

            {/* Calling to */}
            <p className="text-slate-500 text-[11px] mb-6">
              Calling → <span className="text-slate-300">{restaurantName}</span>
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-8">
              {/* Decline */}
              <div className="text-center">
                <button
                  onClick={onDecline}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/40 hover:scale-105 active:scale-95 transition-all"
                >
                  <PhoneOff className="h-7 w-7" />
                </button>
                <p className="text-slate-400 text-[11px] mt-2 font-medium">Decline</p>
              </div>

              {/* Answer */}
              <div className="text-center">
                <button
                  onClick={onAnswer}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/40 hover:scale-105 active:scale-95 transition-all animate-bounce"
                  style={{ animationDuration: '1.5s' }}
                >
                  <Phone className="h-7 w-7" />
                </button>
                <p className="text-slate-300 text-[11px] mt-2 font-medium">Answer</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Pulsating Rings ──────────── */
function PulseRings({ color = 'green' }: { color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'border-green-400',
    amber: 'border-amber-400',
    red: 'border-red-400',
    blue: 'border-blue-400',
  };
  const borderColor = colorMap[color] || colorMap.green;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className={cn('absolute w-20 h-20 rounded-full border-2 animate-ping opacity-20', borderColor)} />
      <div
        className={cn('absolute w-28 h-28 rounded-full border animate-ping opacity-10', borderColor)}
        style={{ animationDelay: '0.5s' }}
      />
    </div>
  );
}

/* ──────────── State Status Pill ──────────── */
function ConversationStatePill({ state }: { state: ConversationState }) {
  const configs: Record<ConversationState, { label: string; icon: typeof Ear; color: string; pulse?: boolean }> = {
    IDLE: { label: 'Idle', icon: Phone, color: 'bg-muted text-muted-foreground' },
    CALIBRATING: { label: 'Calibrating...', icon: Radio, color: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', pulse: true },
    LISTENING: { label: 'Listening...', icon: Ear, color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', pulse: true },
    USER_SPEAKING: { label: 'You\'re speaking', icon: Mic, color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300', pulse: true },
    PROCESSING: { label: 'Processing...', icon: Zap, color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', pulse: true },
    AGENT_SPEAKING: { label: 'Agent speaking', icon: AudioLines, color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', pulse: true },
  };
  const c = configs[state];
  const Icon = c.icon;

  return (
    <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300', c.color)}>
      <Icon className={cn('h-3.5 w-3.5', c.pulse && 'animate-pulse')} />
      {c.label}
    </div>
  );
}

/* ════════════════ MAIN PAGE ════════════════ */
export function VoiceSimulatorPage() {
  const { company } = useAuthStore();
  const companyId = company?.id || '';

  /* ─── Incoming Call State ─── */
  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const incomingCallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── Call State ─── */
  const [isInCall, setIsInCall] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callActive, setCallActive] = useState(true);

  /* ─── Interaction Mode ─── */
  const [mode, setMode] = useState<InteractionMode>('live');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [speechThreshold, setSpeechThreshold] = useState(0.02);
  const [silenceDuration, setSilenceDuration] = useState(2500);

  /* ─── Processing stage (for granular progress) ─── */
  const [processingStage, setProcessingStage] = useState<string>('');

  /* ─── Push-to-Talk refs ─── */
  const [isRecording, setIsRecording] = useState(false);
  const [, setIsPlayingPTT] = useState(false);
  const [isSpeakingPTT, setIsSpeakingPTT] = useState(false);
  const pttRecorderRef = useRef<MediaRecorder | null>(null);
  const pttChunksRef = useRef<Blob[]>([]);
  const pttStreamRef = useRef<MediaStream | null>(null);
  const pttAudioCtxRef = useRef<AudioContext | null>(null);
  const pttAnalyserRef = useRef<AnalyserNode | null>(null);
  const pttAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  /* ─── History ─── */
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageInfo[]>([]);

  /* ─── Refs ─── */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const greetingPlayedRef = useRef(false);

  /* ─── Voice Conversation Hook (for "Live" mode) ─── */
  const voiceConv = useVoiceConversation(
    {
      companyId,
      sessionId,
      ttsEnabled,
      speechThreshold,
      silenceDurationMs: silenceDuration,
      minSpeechMs: 500,
      noiseMultiplierOnset: 3.0,
      noiseMultiplierOffset: 1.8,
    },
    {
      onSessionId: (id) => setSessionId(id),
      onUserMessage: (text) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date(),
            isVoice: true,
          },
        ]);
      },
      onAgentMessage: (text, latencyMs, toolsUsed) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-ai-${Date.now()}`,
            role: 'assistant',
            content: text,
            timestamp: new Date(),
            latency_ms: latencyMs,
            tools_used: toolsUsed,
          },
        ]);
      },
      onCallActive: (active) => {
        setCallActive(active);
        if (!active) {
          setTimeout(() => handleEndCall(), 2500);
        }
      },
      onError: (msg) => toast.error(msg),
      onProcessingStage: (stage) => setProcessingStage(stage),
    },
  );

  /* ─── Refs for scroll container ─── */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  /* ─── Auto-scroll (only when user is near the bottom) ─── */
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // If the user scrolled up, don't force them down
    if (userScrolledUpRef.current) return;
    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* ─── Detect manual scroll-up ─── */
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      userScrolledUpRef.current = !atBottom;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  /* ─── Call timer ─── */
  useEffect(() => {
    if (isInCall && !isRinging) {
      timerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isInCall, isRinging]);

  /* ─── Auto-show incoming call after 2 seconds ─── */
  useEffect(() => {
    if (!isInCall && messages.length === 0) {
      incomingCallTimerRef.current = setTimeout(() => {
        setShowIncomingCall(true);
      }, 2000);
    }
    return () => {
      if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    };
  }, []); // Only on initial mount

  /* ─── Cleanup on unmount ─── */
  useEffect(() => {
    return () => {
      pttStreamRef.current?.getTracks().forEach((t) => t.stop());
      pttAudioCtxRef.current?.close();
    };
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  /* ────────────────── Mutations ────────────────── */

  // Start call
  const startCallMutation = useMutation({
    mutationFn: () => aiService.startCall(companyId),
    onSuccess: async (data: ChatResponse) => {
      setIsRinging(false);
      setSessionId(data.session_id);
      setCallActive(data.call_active);
      greetingPlayedRef.current = false;

      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      };
      setMessages([msg]);

      // Play greeting TTS, then start continuous listening if in live mode
      if (ttsEnabled) {
        await playGreetingTTS(data.response);
      } else if (mode === 'live') {
        // No TTS → start listening immediately
        voiceConv.startListening();
      }

      if (mode === 'text') {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    onError: (err: any) => {
      setIsRinging(false);
      setIsInCall(false);
      toast.error(err.response?.data?.detail || 'Failed to connect');
    },
  });

  // Send text message
  const sendTextMutation = useMutation({
    mutationFn: (message: string) =>
      aiService.sendMessage(companyId, { message, session_id: sessionId || undefined }),
    onSuccess: async (data: ChatResponse) => {
      setCallActive(data.call_active);
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      };
      setMessages((prev) => [...prev, msg]);

      if (ttsEnabled) {
        if (mode === 'live') {
          // In live mode: play TTS through a temp audio, then resume listening
          try {
            const blob = await aiService.synthesize(data.response);
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
              URL.revokeObjectURL(url);
              if (!data.call_active) {
                handleEndCall();
              } else {
                voiceConv.startListening();
              }
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              if (!data.call_active) handleEndCall();
              else voiceConv.startListening();
            };
            await audio.play();
          } catch {
            if (!data.call_active) handleEndCall();
            else voiceConv.startListening();
          }
          return;
        } else if (mode === 'ptt') {
          await playPttTTS(data.response);
        }
      } else if (mode === 'live') {
        // No TTS → resume listening immediately
        if (!data.call_active) {
          setTimeout(() => handleEndCall(), 2500);
        } else {
          voiceConv.startListening();
        }
        return;
      }

      if (!data.call_active) setTimeout(() => handleEndCall(), 2500);
    },
    onError: () => toast.error('Failed to send message'),
  });

  // Voice chat (PTT mode)
  const voiceChatMutation = useMutation({
    mutationFn: (blob: Blob) => aiService.voiceChat(blob, companyId, sessionId || undefined),
    onSuccess: async (data: VoiceChatResponse) => {
      setSessionId(data.session_id);
      setCallActive(data.call_active);

      if (data.transcribed_text) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-user-${Date.now()}`,
            role: 'user',
            content: data.transcribed_text,
            timestamp: new Date(),
            isVoice: true,
          },
        ]);
      }

      const msg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: data.text_response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      };
      setMessages((prev) => [...prev, msg]);

      if (ttsEnabled) await playPttTTS(data.text_response);
      if (!data.call_active) setTimeout(() => handleEndCall(), 2500);
    },
    onError: () => {
      toast.error('Voice processing failed');
      setIsRecording(false);
    },
  });

  // Sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ['ai-sessions', companyId],
    queryFn: () => aiService.listSessions(companyId),
    enabled: showHistory && !!companyId,
  });

  /* ────────────────── Greeting TTS ────────────────── */
  const playGreetingTTS = async (text: string) => {
    try {
      const blob = await aiService.synthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        greetingPlayedRef.current = true;
        // After greeting → start continuous listening in live mode
        if (mode === 'live') {
          voiceConv.startListening();
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        greetingPlayedRef.current = true;
        if (mode === 'live') {
          voiceConv.startListening();
        }
      };

      await audio.play();
    } catch (e) {
      console.error('Greeting TTS error:', e);
      greetingPlayedRef.current = true;
      if (mode === 'live') {
        voiceConv.startListening();
      }
    }
  };

  /* ────────────────── PTT TTS Playback ────────────────── */
  const playPttTTS = async (text: string) => {
    try {
      setIsSpeakingPTT(true);
      const blob = await aiService.synthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      pttAudioPlayerRef.current = audio;

      audio.onended = () => {
        setIsSpeakingPTT(false);
        setIsPlayingPTT(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeakingPTT(false);
        setIsPlayingPTT(false);
      };

      setIsPlayingPTT(true);
      await audio.play();
    } catch (e) {
      console.error('PTT TTS error:', e);
      setIsSpeakingPTT(false);
      setIsPlayingPTT(false);
    }
  };

  const stopPttTTS = () => {
    if (pttAudioPlayerRef.current) {
      pttAudioPlayerRef.current.pause();
      pttAudioPlayerRef.current.currentTime = 0;
    }
    setIsSpeakingPTT(false);
    setIsPlayingPTT(false);
  };

  /* ────────────────── PTT Recording ────────────────── */
  const startPttRecording = async () => {
    try {
      stopPttTTS();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pttStreamRef.current = stream;

      const audioCtx = new AudioContext();
      pttAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      pttAnalyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      pttRecorderRef.current = recorder;
      pttChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) pttChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(pttChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        pttAnalyserRef.current = null;
        if (blob.size > 100) voiceChatMutation.mutate(blob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast.error('Microphone access denied');
      } else {
        toast.error('Could not access microphone');
      }
    }
  };

  const stopPttRecording = () => {
    if (pttRecorderRef.current && pttRecorderRef.current.state !== 'inactive') {
      pttRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  /* ────────────────── Call Actions ────────────────── */
  const handleStartCall = useCallback(() => {
    setShowIncomingCall(false);
    setIsInCall(true);
    setIsRinging(true);
    setMessages([]);
    setCallDuration(0);
    setSessionId(null);
    setCallActive(true);
    greetingPlayedRef.current = false;
    setTimeout(() => startCallMutation.mutate(), 1500);
  }, [companyId]);

  const handleDeclineCall = useCallback(() => {
    setShowIncomingCall(false);
  }, []);

  const handleEndCall = useCallback(() => {
    setIsInCall(false);
    setIsRinging(false);
    setIsRecording(false);
    stopPttTTS();
    voiceConv.stopListening();
    if (timerRef.current) clearInterval(timerRef.current);
    if (pttStreamRef.current) {
      pttStreamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, [voiceConv]);

  const handleSendText = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendTextMutation.isPending) return;
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}`, role: 'user', content: text, timestamp: new Date() },
    ]);
    setInputText('');
    sendTextMutation.mutate(text);
  }, [inputText, sendTextMutation]);

  const handleViewSession = async (sid: string) => {
    try {
      const msgs = await aiService.getSessionHistory(companyId, sid);
      setSelectedSession(sid);
      setSessionMessages(msgs);
    } catch {
      toast.error('Failed to load session');
    }
  };

  const handleQuickPhrase = (phrase: string) => {
    // In live mode, pause listening while we send text
    if (mode === 'live' && !voiceConv.isIdle) {
      voiceConv.stopListening();
    }

    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}`, role: 'user', content: phrase, timestamp: new Date() },
    ]);
    sendTextMutation.mutate(phrase);
  };

  const isPending =
    sendTextMutation.isPending ||
    voiceChatMutation.isPending ||
    startCallMutation.isPending ||
    voiceConv.isProcessing;

  // Determine top bar state label
  const getTopBarStatus = (): string => {
    if (isRinging) return 'Ringing...';
    if (!isInCall) return 'Press Start Call to begin';

    if (mode === 'live') {
      switch (voiceConv.state) {
        case 'CALIBRATING':
          return 'Live · Calibrating noise...';
        case 'LISTENING':
          return 'Live · Listening...';
        case 'USER_SPEAKING':
          return 'Live · You\'re speaking';
        case 'PROCESSING':
          return `Live · ${processingStage || 'Processing...'}`;
        case 'AGENT_SPEAKING':
          return 'Live · Agent speaking';
        default:
          return `Active call · ${formatDuration(callDuration)}`;
      }
    }
    return `Active call · ${formatDuration(callDuration)}`;
  };

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Agent Simulator</h1>
          <p className="text-muted-foreground text-sm">
            Simulate a realistic phone call with the AI restaurant receptionist
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4 mr-2" />
            Call History
          </Button>
        </div>
      </div>

      {/* ─── Main Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ═══════ Phone Panel ═══════ */}
        <div className="lg:col-span-8">
          <Card className="overflow-hidden border shadow-lg">
            {/* ── Top Bar ── */}
            <div
              className={cn(
                'px-5 py-3 flex items-center justify-between transition-all duration-500',
                isInCall
                  ? isRinging
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                    : voiceConv.isListening
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white'
                      : voiceConv.isUserSpeaking
                        ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
                        : voiceConv.isAgentSpeaking
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white'
                          : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white'
                  : 'bg-muted/60',
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                    isInCall ? 'bg-white/20' : 'bg-muted-foreground/10',
                  )}
                >
                  {isRinging ? (
                    <PhoneCall className="h-5 w-5 animate-pulse" />
                  ) : isInCall ? (
                    <Phone className="h-5 w-5" />
                  ) : (
                    <Phone className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm leading-tight">
                    {isRinging
                      ? 'Calling...'
                      : isInCall
                        ? company?.name || 'Restaurant'
                        : 'Phone Call Simulator'}
                  </p>
                  <p className="text-xs opacity-75">{getTopBarStatus()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isInCall && !isRinging && mode === 'live' && (
                  <ConversationStatePill state={voiceConv.state} />
                )}
                {isInCall && !isRinging && (
                  <>
                    {(isSpeakingPTT || voiceConv.isAgentSpeaking) && mode !== 'live' && (
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-white/15 rounded-full mr-1">
                        <AudioLines className="h-3.5 w-3.5 animate-pulse" />
                        <span className="text-[11px] font-medium">Agent speaking</span>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/20"
                      onClick={() => setTtsEnabled(!ttsEnabled)}
                      title={ttsEnabled ? 'Mute TTS' : 'Unmute TTS'}
                    >
                      {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </Button>
                  </>
                )}
                {isInCall && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleEndCall}
                    className="bg-red-600 hover:bg-red-700 shadow-lg"
                  >
                    <PhoneOff className="h-4 w-4 mr-1.5" />
                    End
                  </Button>
                )}
              </div>
            </div>

            {/* ── Chat + Interaction Area ── */}
            <div className="flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-5 py-4"
              >
                {!isInCall && messages.length === 0 ? (
                  /* ─── Idle Screen ─── */
                  <div className="flex flex-col items-center justify-center h-full min-h-[420px] text-center">
                    <div className="relative mb-8">
                      <div className="bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/20 p-8 rounded-full">
                        <Phone className="h-14 w-14 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white p-1.5 rounded-full">
                        <Bot className="h-4 w-4" />
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">AI Restaurant Receptionist</h3>
                    <p className="text-muted-foreground max-w-sm mb-8 text-sm leading-relaxed">
                      Experience a realistic phone call with our AI. In <strong>Live mode</strong>,
                      just talk naturally — the system automatically detects when you speak and when you pause.
                    </p>
                    <Button
                      size="lg"
                      onClick={handleStartCall}
                      className="gap-2 px-8 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 transition-all hover:scale-[1.02]"
                    >
                      <Phone className="h-5 w-5" />
                      Start Call
                    </Button>

                    <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
                      {[
                        { icon: Radio, label: 'Live Mode', desc: 'Continuous listening', color: 'text-emerald-500' },
                        { icon: Bot, label: 'AI Agent', desc: 'Smart responses', color: 'text-blue-500' },
                        { icon: AudioLines, label: 'Auto Turn-Taking', desc: 'Natural flow', color: 'text-amber-500' },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <div className="bg-muted/60 p-3 rounded-xl inline-flex mb-2">
                            <item.icon className={cn('h-5 w-5', item.color)} />
                          </div>
                          <p className="text-xs font-medium">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* ─── Messages ─── */
                  <div className="space-y-4">
                    {isRinging && (
                      <div className="flex justify-center py-12">
                        <div className="text-center relative">
                          <PulseRings color="amber" />
                          <div className="relative z-10 bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/20 p-6 rounded-full">
                            <PhoneCall className="h-10 w-10 text-amber-600 dark:text-amber-400 animate-bounce" />
                          </div>
                          <p className="mt-5 text-sm text-muted-foreground animate-pulse font-medium">
                            Ringing...
                          </p>
                        </div>
                      </div>
                    )}

                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex gap-2.5 animate-in slide-in-from-bottom-2 duration-300',
                          msg.role === 'user' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {msg.role === 'assistant' && (
                          <div className="flex-shrink-0 mt-1">
                            <div className="bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/20 p-2 rounded-full">
                              <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                          </div>
                        )}

                        <div
                          className={cn(
                            'max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm',
                            msg.role === 'user'
                              ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-md'
                              : 'bg-card border rounded-bl-md',
                          )}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <div
                            className={cn(
                              'flex items-center gap-2 mt-1.5 flex-wrap',
                              msg.role === 'user' ? 'justify-end' : 'justify-start',
                            )}
                          >
                            {msg.isVoice && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[9px] h-4 px-1',
                                  msg.role === 'user'
                                    ? 'border-white/30 text-white/70'
                                    : 'border-emerald-300 text-emerald-600',
                                )}
                              >
                                <Mic className="h-2 w-2 mr-0.5" />
                                voice
                              </Badge>
                            )}
                            <span
                              className={cn(
                                'text-[10px]',
                                msg.role === 'user' ? 'text-white/60' : 'text-muted-foreground',
                              )}
                            >
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.latency_ms != null && (
                              <span
                                className={cn(
                                  'text-[10px]',
                                  msg.role === 'user' ? 'text-white/60' : 'text-muted-foreground',
                                )}
                              >
                                · {msg.latency_ms}ms
                              </span>
                            )}
                            {msg.tools_used && msg.tools_used.length > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[9px] h-4 px-1 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                              >
                                <Wrench className="h-2 w-2 mr-0.5" />
                                {msg.tools_used.join(', ')}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {msg.role === 'user' && (
                          <div className="flex-shrink-0 mt-1">
                            <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-2 rounded-full">
                              <User className="h-4 w-4 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Typing / Processing indicator */}
                    {isPending && !isRinging && (
                      <div className="flex gap-2.5 justify-start animate-in fade-in duration-200">
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/20 p-2 rounded-full">
                            <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        </div>
                        <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            <span className="text-[11px] text-muted-foreground ml-1">
                              {voiceConv.isProcessing
                                ? (processingStage || 'Processing...')
                                : voiceChatMutation.isPending
                                  ? 'Processing voice...'
                                  : 'Thinking...'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {!callActive && isInCall && (
                      <div className="flex justify-center py-3 animate-in fade-in">
                        <Badge variant="secondary" className="gap-1.5 py-1 px-3">
                          <PhoneOff className="h-3 w-3" />
                          Call ending...
                        </Badge>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* ── Bottom Input Area ── */}
              {isInCall && !isRinging && (
                <div className="border-t bg-muted/30 px-4 py-3">
                  {/* Mode Toggle */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5">
                      {([
                        { key: 'live' as const, icon: Radio, label: 'Live' },
                        { key: 'ptt' as const, icon: Hand, label: 'Push-to-Talk' },
                        { key: 'text' as const, icon: Keyboard, label: 'Text' },
                      ]).map((m) => (
                        <button
                          key={m.key}
                          onClick={() => {
                            // Clean up current mode
                            if (mode === 'live' && m.key !== 'live') {
                              voiceConv.stopListening();
                            }
                            if (mode !== 'live' && m.key === 'live' && greetingPlayedRef.current) {
                              // Switching to live mode mid-call → start listening
                              voiceConv.startListening();
                            }
                            setMode(m.key);
                            if (m.key === 'text') {
                              setTimeout(() => inputRef.current?.focus(), 100);
                            }
                          }}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            mode === m.key
                              ? m.key === 'live'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : m.key === 'ptt'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'bg-blue-600 text-white shadow-sm'
                              : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <m.icon className="h-3.5 w-3.5" />
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      {mode === 'live' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setShowSettings(!showSettings)}
                          title="VAD Settings"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Label htmlFor="tts-toggle" className="text-[11px] text-muted-foreground">
                        TTS
                      </Label>
                      <Switch
                        id="tts-toggle"
                        checked={ttsEnabled}
                        onCheckedChange={setTtsEnabled}
                        className="scale-75"
                      />
                    </div>
                  </div>

                  {/* VAD Settings (collapsible) */}
                  {showSettings && mode === 'live' && (
                    <div className="mb-3 p-3 bg-muted/40 rounded-lg border space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Min Speech Threshold</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">{speechThreshold.toFixed(3)}</span>
                      </div>
                      <Slider
                        value={[speechThreshold]}
                        onValueChange={([v]) => setSpeechThreshold(v)}
                        min={0.005}
                        max={0.05}
                        step={0.001}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted-foreground">Minimum absolute threshold. Adaptive noise floor may increase this automatically.</p>

                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Silence Before Send</Label>
                        <span className="text-[10px] text-muted-foreground font-mono">{silenceDuration}ms</span>
                      </div>
                      <Slider
                        value={[silenceDuration]}
                        onValueChange={([v]) => setSilenceDuration(v)}
                        min={600}
                        max={3000}
                        step={100}
                        className="w-full"
                      />
                      <p className="text-[10px] text-muted-foreground">How long to wait after you stop speaking before sending</p>

                      {/* Noise floor info */}
                      {voiceConv.noiseFloor > 0 && (
                        <div className="pt-2 border-t space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">🔈 Ambient Noise Floor</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{voiceConv.noiseFloor.toFixed(4)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">🎯 Active Threshold</span>
                            <span className="text-[10px] font-mono font-medium">{voiceConv.dynamicThreshold.toFixed(4)}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground italic">Threshold auto-adapts to ambient noise (×2.5)</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Live Mode ─── */}
                  {mode === 'live' && (
                    <div className="flex flex-col items-center gap-3 py-2">
                      {/* Audio Level Meter */}
                      <AudioLevelMeter
                        level={voiceConv.audioLevel}
                        isActive={voiceConv.isListening || voiceConv.isUserSpeaking || voiceConv.isCalibrating}
                      />

                      {/* Central Visual Indicator */}
                      <div className="relative">
                        <div
                          className={cn(
                            'w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300',
                            voiceConv.isCalibrating
                              ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/30'
                              : voiceConv.isListening
                                ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30'
                                : voiceConv.isUserSpeaking
                                  ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white scale-110 shadow-lg shadow-rose-200 dark:shadow-rose-900/30'
                                  : voiceConv.isProcessing
                                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200'
                                    : voiceConv.isAgentSpeaking
                                      ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-lg shadow-amber-200'
                                      : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {voiceConv.isCalibrating && <Radio className="h-7 w-7 animate-pulse" />}
                          {voiceConv.isListening && <Ear className="h-7 w-7" />}
                          {voiceConv.isUserSpeaking && <Mic className="h-7 w-7 animate-pulse" />}
                          {voiceConv.isProcessing && <Loader2 className="h-7 w-7 animate-spin" />}
                          {voiceConv.isAgentSpeaking && <AudioLines className="h-7 w-7 animate-pulse" />}
                          {voiceConv.isIdle && <Radio className="h-7 w-7" />}
                        </div>
                        {voiceConv.isCalibrating && <PulseRings color="green" />}
                        {voiceConv.isListening && <PulseRings color="green" />}
                        {voiceConv.isUserSpeaking && <PulseRings color="red" />}
                      </div>

                      {/* Barge-in button when agent is speaking */}
                      {voiceConv.isAgentSpeaking && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={voiceConv.interruptAgent}
                          className="gap-1.5 text-xs animate-in fade-in duration-200"
                        >
                          <CircleStop className="h-3.5 w-3.5" />
                          Interrupt & Speak
                        </Button>
                      )}

                      {/* Re-calibrate button when listening */}
                      {voiceConv.isListening && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={voiceConv.recalibrate}
                          className="gap-1.5 text-[10px] h-6 px-2 opacity-60 hover:opacity-100"
                        >
                          <Radio className="h-3 w-3" />
                          Re-calibrate noise
                        </Button>
                      )}

                      {/* Status text */}
                      <p className="text-[11px] text-muted-foreground text-center">
                        {voiceConv.isCalibrating && 'Measuring ambient noise... stay quiet'}
                        {voiceConv.isListening && 'Listening... Just speak naturally'}
                        {voiceConv.isUserSpeaking && 'Hearing you... pause when done'}
                        {voiceConv.isProcessing && (processingStage || 'Processing...')}
                        {voiceConv.isAgentSpeaking && 'Agent is responding... Click to interrupt'}
                        {voiceConv.isIdle && 'Microphone initializing...'}
                      </p>

                      {/* Noise floor indicator (shown in listening states) */}
                      {(voiceConv.isListening || voiceConv.isUserSpeaking || voiceConv.isCalibrating) && voiceConv.noiseFloor > 0 && (
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70 font-mono">
                          <span>Noise: {voiceConv.noiseFloor.toFixed(4)}</span>
                          <span>Threshold: {voiceConv.dynamicThreshold.toFixed(4)}</span>
                          <span>Level: {voiceConv.audioLevel.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Push-to-Talk Mode ─── */}
                  {mode === 'ptt' && (
                    <div className="flex flex-col items-center gap-3 py-2">
                      {isRecording && (
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-xs text-red-500 font-medium">Recording...</span>
                          <LiveWaveform analyser={pttAnalyserRef.current} isActive={isRecording} />
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                        {isSpeakingPTT && (
                          <Button variant="outline" size="sm" onClick={stopPttTTS} className="gap-1.5 text-xs">
                            <CircleStop className="h-3.5 w-3.5" />
                            Stop Speaking
                          </Button>
                        )}
                        <button
                          onMouseDown={() => {
                            if (!isPending && callActive && !isSpeakingPTT) startPttRecording();
                          }}
                          onMouseUp={() => {
                            if (isRecording) stopPttRecording();
                          }}
                          onMouseLeave={() => {
                            if (isRecording) stopPttRecording();
                          }}
                          onTouchStart={() => {
                            if (!isPending && callActive && !isSpeakingPTT) startPttRecording();
                          }}
                          onTouchEnd={() => {
                            if (isRecording) stopPttRecording();
                          }}
                          disabled={isPending || !callActive || isSpeakingPTT}
                          className={cn(
                            'relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200',
                            isRecording
                              ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-200 dark:shadow-red-900/30'
                              : isPending
                                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white hover:scale-105 shadow-lg shadow-rose-200 dark:shadow-rose-900/30 active:scale-95',
                          )}
                        >
                          {isPending ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : isRecording ? (
                            <MicOff className="h-6 w-6" />
                          ) : (
                            <Mic className="h-6 w-6" />
                          )}
                          {isRecording && <PulseRings color="red" />}
                        </button>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {isPending ? 'Processing...' : isSpeakingPTT ? 'Agent is speaking...' : 'Hold to speak · Release to send'}
                      </p>
                    </div>
                  )}

                  {/* ─── Text Mode ─── */}
                  {mode === 'text' && (
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        placeholder="Type your message..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendText();
                          }
                        }}
                        disabled={isPending || !callActive}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleSendText}
                        disabled={!inputText.trim() || isPending || !callActive}
                        size="icon"
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {sendTextMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ═══════ Side Panel ═══════ */}
        <div className="lg:col-span-4 space-y-4">
          {/* Quick Phrases */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-blue-500" />
                Quick Phrases
              </h3>
              <p className="text-[11px] text-muted-foreground mb-3">Click to send as the caller</p>
              <div className="space-y-1.5">
                {[
                  "Hi, I'd like to make a reservation",
                  'I want to check my reservation',
                  'What are your hours?',
                  'Do you have vegetarian options?',
                  "What's your address?",
                  'Can I cancel my reservation?',
                  'Do you have any specials today?',
                  'Party of 6, any availability this Saturday?',
                  'Do you have outdoor seating?',
                  'Thank you, goodbye',
                ].map((phrase, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-auto py-2 px-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 font-normal"
                    disabled={!isInCall || isRinging || isPending || !callActive}
                    onClick={() => handleQuickPhrase(phrase)}
                  >
                    <span className="truncate">{phrase}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Session Info */}
          {sessionId && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Session Info
                </h3>
                <div className="space-y-2.5 text-xs">
                  {[
                    { label: 'Session', value: sessionId.slice(0, 18) + '...' },
                    { label: 'Messages', value: messages.length },
                    { label: 'Duration', value: formatDuration(callDuration) },
                    {
                      label: 'Mode',
                      value: mode === 'live' ? '🟢 Live' : mode === 'ptt' ? '🔴 Push-to-Talk' : '⌨️ Text',
                    },
                    { label: 'TTS', value: ttsEnabled ? 'On' : 'Off' },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={callActive ? 'default' : 'secondary'}
                      className={cn('text-[10px] h-5', callActive && 'bg-emerald-600 hover:bg-emerald-600')}
                    >
                      {callActive ? 'Active' : 'Ended'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* How It Works */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-purple-500" />
                How It Works
              </h3>
              <div className="space-y-3 text-xs text-muted-foreground">
                {(mode === 'live'
                  ? [
                      {
                        step: '1',
                        label: 'Continuous Listening',
                        desc: 'Mic is always on, VAD detects speech',
                        color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
                      },
                      {
                        step: '2',
                        label: 'Auto-Send on Silence',
                        desc: `After ${(silenceDuration / 1000).toFixed(1)}s of silence, audio is sent`,
                        color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
                      },
                      {
                        step: '3',
                        label: 'AI Responds + TTS',
                        desc: 'Agent speaks, then listens again',
                        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
                      },
                      {
                        step: '4',
                        label: 'Interrupt Anytime',
                        desc: 'Click to interrupt the agent mid-speech',
                        color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
                      },
                    ]
                  : [
                      {
                        step: '1',
                        label: 'You speak or type',
                        desc: 'Audio is transcribed by Whisper',
                        color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
                      },
                      {
                        step: '2',
                        label: 'AI processes',
                        desc: 'LangGraph multi-agent routing',
                        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
                      },
                      {
                        step: '3',
                        label: 'Agent responds',
                        desc: 'Text + voice via OpenAI TTS',
                        color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
                      },
                    ]
                ).map((item) => (
                  <div key={item.step} className="flex gap-2.5">
                    <div
                      className={cn(
                        'rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
                        item.color,
                      )}
                    >
                      {item.step}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-[11px]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══════ Incoming Call Overlay ═══════ */}
      {showIncomingCall && (
        <IncomingCallOverlay
          onAnswer={handleStartCall}
          onDecline={handleDeclineCall}
          restaurantName={company?.name || 'Restaurant'}
        />
      )}

      {/* ═══════ History Dialog ═══════ */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Call History</DialogTitle>
            <DialogDescription>Review previous AI phone call simulations</DialogDescription>
          </DialogHeader>

          {selectedSession ? (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedSession(null);
                  setSessionMessages([]);
                }}
              >
                ← Back to sessions
              </Button>
              <ScrollArea className="h-[50vh]">
                <div className="space-y-3 pr-4">
                  {sessionMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn('flex gap-2.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                    >
                      {msg.role !== 'user' && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-full">
                            <Bot className="h-3 w-3 text-emerald-600" />
                          </div>
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[75%] rounded-xl px-3 py-2 shadow-sm',
                          msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-card border',
                        )}
                      >
                        <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {msg.input_type === 'voice' && (
                            <Badge variant="outline" className="text-[8px] h-3 px-1">
                              <Mic className="h-2 w-2 mr-0.5" />
                              voice
                            </Badge>
                          )}
                          {msg.timestamp && (
                            <span
                              className={cn(
                                'text-[9px]',
                                msg.role === 'user' ? 'text-white/60' : 'text-muted-foreground',
                              )}
                            >
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          )}
                          {msg.latency_ms && (
                            <span className="text-[9px] text-muted-foreground">· {msg.latency_ms}ms</span>
                          )}
                        </div>
                      </div>
                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-blue-600 p-1.5 rounded-full">
                            <User className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <ScrollArea className="h-[50vh]">
              <div className="space-y-2 pr-4">
                {sessions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No call history yet</p>
                    <p className="text-xs mt-1">Start a call to see it here</p>
                  </div>
                ) : (
                  sessions.map((session: SessionInfo) => (
                    <button
                      key={session.session_id}
                      onClick={() => handleViewSession(session.session_id)}
                      className="w-full text-left p-3.5 rounded-xl border hover:bg-muted/50 transition-all hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-full">
                            <PhoneCall className="h-3.5 w-3.5 text-emerald-600" />
                          </div>
                          <span className="text-sm font-medium">
                            {session.started_at
                              ? new Date(session.started_at).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Unknown'}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {session.message_count} msgs
                        </Badge>
                      </div>
                      {session.customer_phone && (
                        <p className="text-xs text-muted-foreground mt-1.5 ml-9">📞 {session.customer_phone}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
