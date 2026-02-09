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
  Waves,
  Keyboard,
  AudioLines,
  CircleStop,
  Info,
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

/* ───────────── Audio Waveform ───────────── */
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

      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
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

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={60}
      className="w-full max-w-[280px]"
    />
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

/* ════════════════ MAIN PAGE ════════════════ */
export function VoiceSimulatorPage() {
  const { company } = useAuthStore();
  const companyId = company?.id || '';

  /* ─── Call State ─── */
  const [isInCall, setIsInCall] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callActive, setCallActive] = useState(true);

  /* ─── Voice Mode ─── */
  const [voiceMode, setVoiceMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // agent speaking
  const [ttsEnabled, setTtsEnabled] = useState(true);

  /* ─── Audio refs ─── */
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  /* ─── History ─── */
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageInfo[]>([]);

  /* ─── Refs ─── */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Auto-scroll ─── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ─── Call timer ─── */
  useEffect(() => {
    if (isInCall && !isRinging) {
      timerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isInCall, isRinging]);

  /* ─── Cleanup on unmount ─── */
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
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
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      };
      setMessages([msg]);

      // Speak the greeting
      if (ttsEnabled) {
        await playTTS(data.response);
      }

      if (!voiceMode) {
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
      if (ttsEnabled) await playTTS(data.response);
      if (!data.call_active) setTimeout(() => handleEndCall(), 2500);
    },
    onError: () => toast.error('Failed to send message'),
  });

  // Voice chat (send audio)
  const voiceChatMutation = useMutation({
    mutationFn: (blob: Blob) => aiService.voiceChat(blob, companyId, sessionId || undefined),
    onSuccess: async (data: VoiceChatResponse) => {
      setSessionId(data.session_id);
      setCallActive(data.call_active);

      // Add user message (transcribed)
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

      // Add assistant message
      const msg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: data.text_response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      };
      setMessages((prev) => [...prev, msg]);

      if (ttsEnabled) await playTTS(data.text_response);
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

  /* ────────────────── TTS Playback ────────────────── */
  const playTTS = async (text: string) => {
    try {
      setIsSpeaking(true);
      const blob = await aiService.synthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        setIsPlaying(false);
      };

      setIsPlaying(true);
      await audio.play();
    } catch (e) {
      console.error('TTS playback error:', e);
      setIsSpeaking(false);
      setIsPlaying(false);
    }
  };

  const stopTTS = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
    setIsPlaying(false);
  };

  /* ────────────────── Microphone Recording ────────────────── */
  const startRecording = async () => {
    try {
      // Stop TTS if playing
      stopTTS();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start recording
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Stop the stream tracks
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        analyserRef.current = null;

        if (blob.size > 100) {
          voiceChatMutation.mutate(blob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please allow microphone access in browser settings.');
      } else {
        toast.error('Could not access microphone');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  /* ────────────────── Call Actions ────────────────── */
  const handleStartCall = useCallback(() => {
    setIsInCall(true);
    setIsRinging(true);
    setMessages([]);
    setCallDuration(0);
    setSessionId(null);
    setCallActive(true);
    setTimeout(() => startCallMutation.mutate(), 1500);
  }, [companyId]);

  const handleEndCall = useCallback(() => {
    setIsInCall(false);
    setIsRinging(false);
    setIsRecording(false);
    stopTTS();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

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

  const isPending = sendTextMutation.isPending || voiceChatMutation.isPending || startCallMutation.isPending;

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Agent Simulator</h1>
          <p className="text-muted-foreground text-sm">
            Simulate a phone call with the AI restaurant receptionist
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
                    : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white'
                  : 'bg-muted/60'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                    isInCall ? 'bg-white/20' : 'bg-muted-foreground/10'
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
                  <p className="text-xs opacity-75">
                    {isInCall
                      ? isRinging
                        ? 'Ringing...'
                        : `Active call · ${formatDuration(callDuration)}`
                      : 'Press Start Call to begin'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isInCall && !isRinging && (
                  <>
                    {isSpeaking && (
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
              <ScrollArea className="flex-1 px-5 py-4">
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
                      Experience a realistic phone call with our AI. Speak or type — the agent can make reservations,
                      answer menu questions, and handle restaurant inquiries.
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
                        { icon: Mic, label: 'Voice Input', desc: 'Speak naturally', color: 'text-rose-500' },
                        { icon: Bot, label: 'AI Agent', desc: 'Smart responses', color: 'text-blue-500' },
                        { icon: Volume2, label: 'Voice Reply', desc: 'Hear the agent', color: 'text-emerald-500' },
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
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
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
                              : 'bg-card border rounded-bl-md'
                          )}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <div
                            className={cn(
                              'flex items-center gap-2 mt-1.5 flex-wrap',
                              msg.role === 'user' ? 'justify-end' : 'justify-start'
                            )}
                          >
                            {msg.isVoice && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[9px] h-4 px-1',
                                  msg.role === 'user'
                                    ? 'border-white/30 text-white/70'
                                    : 'border-emerald-300 text-emerald-600'
                                )}
                              >
                                <Mic className="h-2 w-2 mr-0.5" />
                                voice
                              </Badge>
                            )}
                            <span
                              className={cn(
                                'text-[10px]',
                                msg.role === 'user' ? 'text-white/60' : 'text-muted-foreground'
                              )}
                            >
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.latency_ms != null && (
                              <span
                                className={cn(
                                  'text-[10px]',
                                  msg.role === 'user' ? 'text-white/60' : 'text-muted-foreground'
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
                              <div
                                className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
                                style={{ animationDelay: '0ms' }}
                              />
                              <div
                                className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
                                style={{ animationDelay: '150ms' }}
                              />
                              <div
                                className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
                                style={{ animationDelay: '300ms' }}
                              />
                            </div>
                            <span className="text-[11px] text-muted-foreground ml-1">
                              {voiceChatMutation.isPending ? 'Processing voice...' : 'Thinking...'}
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
              </ScrollArea>

              {/* ── Bottom Input Area ── */}
              {isInCall && !isRinging && (
                <div className="border-t bg-muted/30 px-4 py-3">
                  {/* Mode Toggle */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setVoiceMode(true)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          voiceMode
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Mic className="h-3.5 w-3.5" />
                        Voice
                      </button>
                      <button
                        onClick={() => setVoiceMode(false)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          !voiceMode
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Keyboard className="h-3.5 w-3.5" />
                        Text
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
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

                  {voiceMode ? (
                    /* ─── Voice Input ─── */
                    <div className="flex flex-col items-center gap-3 py-2">
                      {isRecording && (
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-xs text-red-500 font-medium">Recording...</span>
                          <LiveWaveform analyser={analyserRef.current} isActive={isRecording} />
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                        {isSpeaking && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={stopTTS}
                            className="gap-1.5 text-xs"
                          >
                            <CircleStop className="h-3.5 w-3.5" />
                            Stop Speaking
                          </Button>
                        )}

                        <button
                          onMouseDown={() => {
                            if (!isPending && callActive && !isSpeaking) startRecording();
                          }}
                          onMouseUp={() => {
                            if (isRecording) stopRecording();
                          }}
                          onMouseLeave={() => {
                            if (isRecording) stopRecording();
                          }}
                          onTouchStart={() => {
                            if (!isPending && callActive && !isSpeaking) startRecording();
                          }}
                          onTouchEnd={() => {
                            if (isRecording) stopRecording();
                          }}
                          disabled={isPending || !callActive || isSpeaking}
                          className={cn(
                            'relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200',
                            isRecording
                              ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-200 dark:shadow-red-900/30'
                              : isPending
                                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                : 'bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:scale-105 shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 active:scale-95'
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
                        {isPending
                          ? 'Processing...'
                          : isSpeaking
                            ? 'Agent is speaking...'
                            : 'Hold to speak · Release to send'}
                      </p>
                    </div>
                  ) : (
                    /* ─── Text Input ─── */
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
                    onClick={() => {
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `msg-${Date.now()}`,
                          role: 'user',
                          content: phrase,
                          timestamp: new Date(),
                        },
                      ]);
                      sendTextMutation.mutate(phrase);
                    }}
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
                    { label: 'Mode', value: voiceMode ? 'Voice' : 'Text' },
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
                      className={cn(
                        'text-[10px] h-5',
                        callActive && 'bg-emerald-600 hover:bg-emerald-600'
                      )}
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
                {[
                  { step: '1', label: 'You speak or type', desc: 'Audio is transcribed by Whisper', color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600' },
                  { step: '2', label: 'AI processes', desc: 'LangGraph multi-agent routing', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
                  { step: '3', label: 'Agent responds', desc: 'Text + voice via OpenAI TTS', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-2.5">
                    <div
                      className={cn(
                        'rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
                        item.color
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
                      className={cn(
                        'flex gap-2.5',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
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
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-card border'
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
                                msg.role === 'user' ? 'text-white/60' : 'text-muted-foreground'
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
