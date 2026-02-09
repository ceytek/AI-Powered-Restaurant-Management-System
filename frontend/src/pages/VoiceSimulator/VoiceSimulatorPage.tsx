import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiService, type ChatResponse, type MessageInfo, type SessionInfo } from '@/services/aiService';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  PhoneCall,
  Waves,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  latency_ms?: number;
  tools_used?: string[];
}

export function VoiceSimulatorPage() {
  const { company } = useAuthStore();
  const companyId = company?.id || '';

  // Call state
  const [isInCall, setIsInCall] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callActive, setCallActive] = useState(true);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<MessageInfo[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Call timer
  useEffect(() => {
    if (isInCall && !isRinging) {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isInCall, isRinging]);

  // Format call duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start call mutation
  const startCallMutation = useMutation({
    mutationFn: () => aiService.startCall(companyId),
    onSuccess: (data: ChatResponse) => {
      setIsRinging(false);
      setSessionId(data.session_id);
      setCallActive(data.call_active);
      setMessages([{
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    onError: (err: any) => {
      setIsRinging(false);
      setIsInCall(false);
      const msg = err.response?.data?.detail || 'Failed to connect the call';
      toast.error(msg);
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (message: string) =>
      aiService.sendMessage(companyId, {
        message,
        session_id: sessionId || undefined,
      }),
    onSuccess: (data: ChatResponse) => {
      setCallActive(data.call_active);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
        latency_ms: data.latency_ms,
        tools_used: data.tools_used,
      }]);

      if (!data.call_active) {
        // Call ended by the agent (farewell)
        setTimeout(() => handleEndCall(), 2000);
      }
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });

  // Sessions query
  const { data: sessions = [] } = useQuery({
    queryKey: ['ai-sessions', companyId],
    queryFn: () => aiService.listSessions(companyId),
    enabled: showHistory && !!companyId,
  });

  // Start a call
  const handleStartCall = useCallback(() => {
    setIsInCall(true);
    setIsRinging(true);
    setMessages([]);
    setCallDuration(0);
    setSessionId(null);
    setCallActive(true);

    // Simulate ringing for 1.5 seconds
    setTimeout(() => {
      startCallMutation.mutate();
    }, 1500);
  }, [companyId]);

  // End the call
  const handleEndCall = useCallback(() => {
    setIsInCall(false);
    setIsRinging(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Send message
  const handleSendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text || sendMessageMutation.isPending) return;

    setMessages(prev => [...prev, {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }]);
    setInputText('');
    sendMessageMutation.mutate(text);
  }, [inputText, sendMessageMutation]);

  // Load session history
  const handleViewSession = async (sid: string) => {
    try {
      const msgs = await aiService.getSessionHistory(companyId, sid);
      setSelectedSession(sid);
      setSessionMessages(msgs);
    } catch {
      toast.error('Failed to load session history');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voice Agent Simulator</h1>
          <p className="text-muted-foreground">
            Simulate a phone call with the AI restaurant receptionist
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowHistory(true)}>
          <History className="h-4 w-4 mr-2" />
          Call History
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phone UI */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden border-2 min-h-[600px] flex flex-col">
            {/* Call Header */}
            <div className={cn(
              "px-6 py-4 flex items-center justify-between transition-colors",
              isInCall
                ? isRinging
                  ? "bg-amber-500 text-white"
                  : "bg-green-600 text-white"
                : "bg-muted"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  isInCall ? "bg-white/20" : "bg-muted-foreground/10"
                )}>
                  {isRinging ? (
                    <PhoneCall className="h-5 w-5 animate-pulse" />
                  ) : isInCall ? (
                    <Phone className="h-5 w-5" />
                  ) : (
                    <Phone className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {isRinging
                      ? 'Calling...'
                      : isInCall
                        ? `In Call — ${company?.name || 'Restaurant'}`
                        : 'Phone Call Simulator'}
                  </p>
                  <p className="text-xs opacity-80">
                    {isInCall
                      ? isRinging
                        ? 'Ringing...'
                        : formatDuration(callDuration)
                      : 'Click "Start Call" to begin'}
                  </p>
                </div>
              </div>

              {isInCall && (
                <div className="flex items-center gap-2">
                  {!isRinging && (
                    <div className="flex items-center gap-1 mr-4">
                      <Waves className="h-4 w-4 animate-pulse" />
                      <span className="text-xs">Active</span>
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleEndCall}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <PhoneOff className="h-4 w-4 mr-1" />
                    End Call
                  </Button>
                </div>
              )}
            </div>

            {/* Chat Area */}
            <ScrollArea className="flex-1 p-6">
              {!isInCall && messages.length === 0 ? (
                /* Idle State */
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                  <div className="bg-primary/10 p-6 rounded-full mb-6">
                    <Phone className="h-12 w-12 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Ready to Simulate a Call</h3>
                  <p className="text-muted-foreground max-w-md mb-8">
                    Experience how the AI receptionist handles phone calls. It can make reservations,
                    answer menu questions, provide restaurant information, and more.
                  </p>
                  <Button size="lg" onClick={handleStartCall} className="gap-2">
                    <Phone className="h-5 w-5" />
                    Start Call
                  </Button>
                  <div className="mt-8 grid grid-cols-3 gap-4 text-center max-w-lg">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <MessageCircle className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                      <p className="text-xs text-muted-foreground">Make Reservations</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <Volume2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
                      <p className="text-xs text-muted-foreground">Menu & Info</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <Bot className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                      <p className="text-xs text-muted-foreground">Natural Conversation</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Messages */
                <div className="space-y-4">
                  {isRinging && (
                    <div className="flex justify-center py-8">
                      <div className="text-center">
                        <div className="relative inline-block">
                          <PhoneCall className="h-12 w-12 text-amber-500 animate-bounce" />
                          <div className="absolute inset-0 animate-ping opacity-20">
                            <PhoneCall className="h-12 w-12 text-amber-500" />
                          </div>
                        </div>
                        <p className="mt-4 text-muted-foreground animate-pulse">
                          Ringing...
                        </p>
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-3",
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-primary/10 p-2 rounded-full">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                      )}

                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-3",
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md'
                      )}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <div className={cn(
                          "flex items-center gap-2 mt-1.5",
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}>
                          <span className={cn(
                            "text-[10px]",
                            msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                          )}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.latency_ms && (
                            <span className={cn(
                              "text-[10px]",
                              msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                            )}>
                              • {msg.latency_ms}ms
                            </span>
                          )}
                          {msg.tools_used && msg.tools_used.length > 0 && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-primary/30">
                              <Wrench className="h-2.5 w-2.5 mr-0.5" />
                              {msg.tools_used.join(', ')}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-primary p-2 rounded-full">
                            <User className="h-4 w-4 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {sendMessageMutation.isPending && (
                    <div className="flex gap-3 justify-start">
                      <div className="flex-shrink-0 mt-1">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Call ended indicator */}
                  {!callActive && isInCall && (
                    <div className="flex justify-center py-4">
                      <Badge variant="secondary" className="gap-1">
                        <PhoneOff className="h-3 w-3" />
                        Call ended by agent
                      </Badge>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input Area */}
            {isInCall && !isRinging && (
              <div className="border-t px-4 py-3 bg-background">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder="Type your message (as the caller)..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={sendMessageMutation.isPending || !callActive}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || sendMessageMutation.isPending || !callActive}
                    size="icon"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Side Panel - Quick Actions & Info */}
        <div className="space-y-4">
          {/* Quick Phrases */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Quick Phrases
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Click to send as the caller
              </p>
              <div className="space-y-2">
                {[
                  'Hi, I\'d like to make a reservation',
                  'I want to check my reservation',
                  'What are your hours?',
                  'Do you have any vegetarian options?',
                  'What\'s your address?',
                  'Can I cancel my reservation?',
                  'Do you have any specials today?',
                  'I have a party of 6, any availability this Saturday?',
                  'Do you have outdoor seating?',
                  'What\'s your most popular dish?',
                  'Thank you, goodbye',
                ].map((phrase, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-auto py-2 text-left"
                    disabled={!isInCall || isRinging || sendMessageMutation.isPending || !callActive}
                    onClick={() => {
                      setMessages(prev => [...prev, {
                        id: `msg-${Date.now()}`,
                        role: 'user',
                        content: phrase,
                        timestamp: new Date(),
                      }]);
                      sendMessageMutation.mutate(phrase);
                    }}
                  >
                    {phrase}
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
                  <Clock className="h-4 w-4" />
                  Session Info
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Session</span>
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                      {sessionId.slice(0, 20)}...
                    </code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages</span>
                    <span>{messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{formatDuration(callDuration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={callActive ? 'default' : 'secondary'} className="text-[10px] h-5">
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
              <h3 className="font-semibold text-sm mb-3">How It Works</h3>
              <div className="space-y-3 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">1</div>
                  <p><strong>Supervisor</strong> greets you and understands your needs</p>
                </div>
                <div className="flex gap-2">
                  <div className="bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">2</div>
                  <p><strong>Reservation Agent</strong> handles bookings step by step</p>
                </div>
                <div className="flex gap-2">
                  <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">3</div>
                  <p><strong>Info Agent</strong> answers questions using the knowledge base</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Call History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Call History</DialogTitle>
            <DialogDescription>View previous AI phone call simulations</DialogDescription>
          </DialogHeader>

          {selectedSession ? (
            /* Session Detail */
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => { setSelectedSession(null); setSessionMessages([]); }}>
                ← Back to sessions
              </Button>
              <ScrollArea className="h-[50vh]">
                <div className="space-y-3 pr-4">
                  {sessionMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex gap-3",
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {msg.role !== 'user' && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-primary/10 p-1.5 rounded-full">
                            <Bot className="h-3 w-3 text-primary" />
                          </div>
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[75%] rounded-xl px-3 py-2",
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}>
                        <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {msg.timestamp && (
                            <span className={cn(
                              "text-[9px]",
                              msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                            )}>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          )}
                          {msg.latency_ms && (
                            <span className="text-[9px] text-muted-foreground">
                              • {msg.latency_ms}ms
                            </span>
                          )}
                        </div>
                      </div>
                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="bg-primary p-1.5 rounded-full">
                            <User className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            /* Sessions List */
            <ScrollArea className="h-[50vh]">
              <div className="space-y-2 pr-4">
                {sessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No call history yet</p>
                  </div>
                ) : (
                  sessions.map((session: SessionInfo) => (
                    <button
                      key={session.session_id}
                      onClick={() => handleViewSession(session.session_id)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {session.started_at
                              ? new Date(session.started_at).toLocaleDateString([], {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })
                              : 'Unknown'}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {session.message_count} messages
                        </Badge>
                      </div>
                      {session.customer_phone && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📞 {session.customer_phone}
                        </p>
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
