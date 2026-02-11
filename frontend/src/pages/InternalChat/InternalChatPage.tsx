import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, RotateCcw, Clock, Wrench, Sparkles, User, Loader2, History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { aiService } from '@/services/aiService';
import type { InternalSessionInfo, InternalMessageInfo } from '@/services/aiService';

// ─── Types ────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tools_used?: string[];
  latency_ms?: number;
}

// ─── Markdown-like renderer ───────────────────────────

function MessageContent({ content }: { content: string }) {
  // Simple processing: convert **bold**, bullet points, sections, etc.
  const lines = content.split('\n');

  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) return <div key={i} className="h-1.5" />;

        // Headers with ═══
        if (trimmed.match(/^[═]+$/)) return <Separator key={i} className="my-1" />;

        // Bold lines (section titles)
        if (trimmed.startsWith('📋') || trimmed.startsWith('📦') || trimmed.startsWith('📅') ||
            trimmed.startsWith('🪑') || trimmed.startsWith('👥') || trimmed.startsWith('📊') ||
            trimmed.startsWith('🍽️') || trimmed.startsWith('👤') || trimmed.startsWith('📂') ||
            trimmed.startsWith('🕐') || trimmed.startsWith('⏰') || trimmed.startsWith('🏆')) {
          return <div key={i} className="font-semibold mt-2">{formatBold(trimmed)}</div>;
        }

        // Bullet items
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('  •')) {
          return <div key={i} className="pl-4 text-muted-foreground">{formatBold(trimmed)}</div>;
        }

        // Status items with icons
        if (trimmed.match(/^\s*(🔴|🟡|🟢|🔵|⚙️|🧹|✅|⏳|❌|🚫|🔜|⛔|⭐|➕|➖|📌|📍)/)) {
          return <div key={i} className="pl-2">{formatBold(trimmed)}</div>;
        }

        // Numbered items
        if (trimmed.match(/^\d+\./)) {
          return <div key={i} className="pl-4">{formatBold(trimmed)}</div>;
        }

        // Indented lines
        if (line.startsWith('   ') || line.startsWith('\t')) {
          return <div key={i} className="pl-4 text-muted-foreground">{formatBold(trimmed)}</div>;
        }

        return <div key={i}>{formatBold(trimmed)}</div>;
      })}
    </div>
  );
}

function formatBold(text: string): React.ReactNode {
  // Handle **bold** text
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── Quick Action Buttons ─────────────────────────────

const quickActions = [
  { label: 'Daily Overview', message: 'Give me a daily overview', icon: '📋' },
  { label: 'Low Stock', message: 'What items are low in stock?', icon: '📦' },
  { label: "Today's Reservations", message: "Show me today's reservations", icon: '📅' },
  { label: 'Table Status', message: "What's the current table status?", icon: '🪑' },
  { label: "Who's Working", message: "Who's working today?", icon: '👥' },
  { label: 'Menu Highlights', message: 'Show me the top menu items', icon: '🍽️' },
  { label: 'Customer Stats', message: 'Give me customer statistics', icon: '👤' },
  { label: 'Inventory Summary', message: 'Give me an inventory summary', icon: '📊' },
];

// ─── Main Component ───────────────────────────────────

export default function InternalChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<InternalSessionInfo[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      const el = chatScrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (isNearBottom || messages.length <= 2) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await aiService.internalChat(text.trim(), sessionId || undefined);

      if (result.session_id && !sessionId) {
        setSessionId(result.session_id);
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
        tools_used: result.tools_used,
        latency_ms: result.latency_ms,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: error?.response?.data?.detail || 'An error occurred. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [isLoading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewSession = () => {
    setMessages([]);
    setSessionId(null);
    setInput('');
    inputRef.current?.focus();
  };

  const loadSessions = async () => {
    try {
      const data = await aiService.listInternalSessions(20);
      setSessions(data);
      setShowSessions(true);
    } catch {
      console.error('Failed to load sessions');
    }
  };

  const loadSession = async (sid: string) => {
    try {
      const history = await aiService.getInternalSessionHistory(sid);
      const chatMessages: ChatMessage[] = history.map((m: InternalMessageInfo, i: number) => ({
        id: `${m.role}-${i}`,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        latency_ms: m.latency_ms || undefined,
      }));
      setMessages(chatMessages);
      setSessionId(sid);
      setShowSessions(false);
    } catch {
      console.error('Failed to load session');
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Internal Assistant</h1>
            <p className="text-xs text-muted-foreground">
              Ask about inventory, staff, reservations, tables & more
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSessions}>
            <History className="h-4 w-4 mr-1.5" />
            History
          </Button>
          <Button variant="outline" size="sm" onClick={startNewSession}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Session History Panel */}
      {showSessions && (
        <Card className="mb-4 p-4 border-violet-200 dark:border-violet-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Recent Conversations</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowSessions(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No previous conversations.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-accent transition-colors text-sm flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium">{s.session_id.replace('internal-', '').slice(0, 8)}...</span>
                    <span className="text-muted-foreground ml-2">{s.message_count} messages</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {s.last_message_at ? new Date(s.last_message_at).toLocaleDateString() : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden border-violet-200/50 dark:border-violet-800/30">
        {/* Messages */}
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {!hasMessages ? (
            /* Welcome Screen */
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold mb-2">How can I help you today?</h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-md">
                I can provide real-time insights about your restaurant's inventory, staff, reservations, tables, and more.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl w-full">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.message)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border hover:bg-accent hover:border-violet-300 dark:hover:border-violet-700 transition-all text-center group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform">{action.icon}</span>
                    <span className="text-xs font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages List */
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mt-0.5">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-card border rounded-bl-md'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <MessageContent content={msg.content} />
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}

                    {/* Meta info for assistant */}
                    {msg.role === 'assistant' && (msg.tools_used?.length || msg.latency_ms) ? (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                        {msg.tools_used && msg.tools_used.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Wrench className="h-3 w-3 text-muted-foreground" />
                            <div className="flex gap-1 flex-wrap">
                              {msg.tools_used.map((tool, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {tool}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {msg.latency_ms ? (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {msg.latency_ms}ms
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3 justify-start animate-in fade-in duration-200">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mt-0.5">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-card border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t p-3">
          {/* Quick actions row when in conversation */}
          {hasMessages && (
            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-hide">
              {quickActions.slice(0, 4).map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.message)}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs whitespace-nowrap hover:bg-accent hover:border-violet-300 dark:hover:border-violet-700 transition-all disabled:opacity-50"
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about inventory, staff, reservations..."
              className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-h-[42px] max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[42px] w-[42px] rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/20"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
