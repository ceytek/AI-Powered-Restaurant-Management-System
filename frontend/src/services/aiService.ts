import axios from 'axios';

const AI_URL = import.meta.env.VITE_AI_URL || '/ai';

// Separate axios instance for AI service (no auth needed for now)
const aiApi = axios.create({
  baseURL: AI_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* ───────────── Chat / Voice Types ───────────── */

export interface ChatRequest {
  message: string;
  session_id?: string;
  customer_phone?: string;
  input_type?: 'text' | 'voice';
}

export interface ChatResponse {
  response: string;
  session_id: string;
  tools_used: string[];
  latency_ms: number;
  call_active: boolean;
}

export interface SessionInfo {
  session_id: string;
  started_at: string | null;
  last_message_at: string | null;
  message_count: number;
  customer_phone: string | null;
}

export interface MessageInfo {
  role: string;
  content: string;
  input_type: string | null;
  tool_name: string | null;
  latency_ms: number | null;
  timestamp: string | null;
}

export interface TranscribeResponse {
  text: string;
  language: string;
  duration_ms: number;
}

export interface VoiceChatResponse {
  text_response: string;
  session_id: string;
  tools_used: string[];
  latency_ms: number;
  call_active: boolean;
  transcribed_text: string;
  audio_url: string | null;
}

/* ───────────── Knowledge Base Types ───────────── */

export interface KnowledgeCategory {
  id: string;
  company_id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string | null;
}

export interface KnowledgeEntry {
  id: string;
  company_id: string;
  category_id: string | null;
  title: string;
  content: string;
  short_answer: string | null;
  keywords: string[];
  entry_type: string;
  priority: number;
  extra_data: Record<string, unknown>;
  is_active: boolean;
  has_embedding: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface EntriesPage {
  items: KnowledgeEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SyncStatus {
  menu_items_synced: number;
  knowledge_entries_with_embeddings: number;
  knowledge_entries_total: number;
  last_sync: string | null;
}

export interface SearchResult {
  id: string;
  source: string;
  title: string;
  content: string;
  score: number;
  extra_data: Record<string, unknown>;
}

export interface SemanticSearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

/* ───────────── Internal Chat Types ───────────── */

export interface InternalChatResponse {
  response: string;
  session_id: string;
  tools_used: string[];
  latency_ms: number;
}

export interface InternalSessionInfo {
  session_id: string;
  started_at: string | null;
  last_message_at: string | null;
  message_count: number;
}

export interface InternalMessageInfo {
  role: string;
  content: string;
  tool_name: string | null;
  latency_ms: number | null;
  timestamp: string | null;
}

/* ═══════════════ AI SERVICE ═══════════════ */

export const aiService = {
  /** Start a new phone call simulation */
  startCall: async (companyId: string, customerPhone?: string): Promise<ChatResponse> => {
    const params: Record<string, string> = { company_id: companyId };
    if (customerPhone) params.customer_phone = customerPhone;
    const { data } = await aiApi.post<ChatResponse>('/chat/start', null, { params });
    return data;
  },

  /** Send a text message in the conversation */
  sendMessage: async (companyId: string, request: ChatRequest): Promise<ChatResponse> => {
    const { data } = await aiApi.post<ChatResponse>('/chat', request, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Transcribe audio to text */
  transcribe: async (audioBlob: Blob, filename = 'recording.webm', contextHint?: string): Promise<TranscribeResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    const params: Record<string, string> = { language: 'en' };
    if (contextHint) params.context_hint = contextHint;
    const { data } = await aiApi.post<TranscribeResponse>('/voice/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params,
    });
    return data;
  },

  /** Synthesize text to speech - returns audio blob */
  synthesize: async (text: string, voice?: string, speed?: number): Promise<Blob> => {
    const { data } = await aiApi.post('/voice/synthesize', { text, voice, speed }, {
      responseType: 'blob',
    });
    return data;
  },

  /** Full voice pipeline: audio → transcribe → AI → text response */
  voiceChat: async (
    audioBlob: Blob,
    companyId: string,
    sessionId?: string,
    customerPhone?: string,
  ): Promise<VoiceChatResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    const params: Record<string, string> = {
      company_id: companyId,
      language: 'en',  // Force English transcription
    };
    if (sessionId) params.session_id = sessionId;
    if (customerPhone) params.customer_phone = customerPhone;

    const { data } = await aiApi.post<VoiceChatResponse>('/voice/chat', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params,
    });
    return data;
  },

  /** List recent sessions */
  listSessions: async (companyId: string, limit = 20): Promise<SessionInfo[]> => {
    const { data } = await aiApi.get<SessionInfo[]>('/chat/sessions', {
      params: { company_id: companyId, limit },
    });
    return data;
  },

  /** Get session history */
  getSessionHistory: async (companyId: string, sessionId: string): Promise<MessageInfo[]> => {
    const { data } = await aiApi.get<MessageInfo[]>(`/chat/sessions/${sessionId}`, {
      params: { company_id: companyId },
    });
    return data;
  },

  /* ═══════════ Knowledge Base ═══════════ */

  /** List knowledge categories */
  getCategories: async (companyId: string): Promise<KnowledgeCategory[]> => {
    const { data } = await aiApi.get<KnowledgeCategory[]>('/knowledge/categories', {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Create a knowledge category */
  createCategory: async (companyId: string, payload: Record<string, unknown>): Promise<KnowledgeCategory> => {
    const { data } = await aiApi.post<KnowledgeCategory>('/knowledge/categories', payload, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** List knowledge entries (paginated) */
  getEntries: async (
    companyId: string,
    opts: {
      category_id?: string;
      entry_type?: string;
      search?: string;
      page?: number;
      page_size?: number;
    } = {},
  ): Promise<EntriesPage> => {
    const { data } = await aiApi.get<EntriesPage>('/knowledge/entries', {
      params: { company_id: companyId, ...opts },
    });
    return data;
  },

  /** Create a knowledge entry */
  createEntry: async (companyId: string, payload: Record<string, unknown>): Promise<KnowledgeEntry> => {
    const { data } = await aiApi.post<KnowledgeEntry>('/knowledge/entries', payload, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Update a knowledge entry */
  updateEntry: async (companyId: string, entryId: string, payload: Record<string, unknown>): Promise<KnowledgeEntry> => {
    const { data } = await aiApi.put<KnowledgeEntry>(`/knowledge/entries/${entryId}`, payload, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Delete a knowledge entry */
  deleteEntry: async (companyId: string, entryId: string): Promise<{ message: string }> => {
    const { data } = await aiApi.delete<{ message: string }>(`/knowledge/entries/${entryId}`, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Get sync status */
  getSyncStatus: async (companyId: string): Promise<SyncStatus> => {
    const { data } = await aiApi.get<SyncStatus>('/knowledge/sync/status', {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Sync knowledge embeddings */
  syncKnowledgeEmbeddings: async (companyId: string): Promise<{ message: string; embedded: number }> => {
    const { data } = await aiApi.post<{ message: string; embedded: number }>('/knowledge/sync/knowledge-embeddings', null, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Sync menu embeddings */
  syncMenuEmbeddings: async (companyId: string): Promise<{ message: string; synced: number }> => {
    const { data } = await aiApi.post<{ message: string; synced: number }>('/knowledge/sync/menu-embeddings', null, {
      params: { company_id: companyId },
    });
    return data;
  },

  /** Semantic search */
  semanticSearch: async (
    companyId: string,
    query: string,
    searchType = 'all',
    limit = 5,
  ): Promise<SemanticSearchResponse> => {
    const { data } = await aiApi.post<SemanticSearchResponse>(
      '/knowledge/search',
      { query, search_type: searchType, limit },
      { params: { company_id: companyId } },
    );
    return data;
  },

  /* ═══════════ Internal Chat (JWT required) ═══════════ */

  /** Send a message to the internal AI assistant */
  internalChat: async (message: string, sessionId?: string): Promise<InternalChatResponse> => {
    const token = localStorage.getItem('access_token');
    const { data } = await aiApi.post<InternalChatResponse>(
      '/internal-chat',
      { message, session_id: sessionId },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return data;
  },

  /** List internal chat sessions */
  listInternalSessions: async (limit = 20): Promise<InternalSessionInfo[]> => {
    const token = localStorage.getItem('access_token');
    const { data } = await aiApi.get<InternalSessionInfo[]>('/internal-chat/sessions', {
      params: { limit },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },

  /** Get internal session history */
  getInternalSessionHistory: async (sessionId: string): Promise<InternalMessageInfo[]> => {
    const token = localStorage.getItem('access_token');
    const { data } = await aiApi.get<InternalMessageInfo[]>(`/internal-chat/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },
};
