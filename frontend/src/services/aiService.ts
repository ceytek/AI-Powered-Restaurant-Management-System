import axios from 'axios';

const AI_URL = import.meta.env.VITE_AI_URL || '/ai';

// Separate axios instance for AI service (no auth needed for now)
const aiApi = axios.create({
  baseURL: AI_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ChatRequest {
  message: string;
  session_id?: string;
  customer_phone?: string;
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
  transcribe: async (audioBlob: Blob, filename = 'recording.webm'): Promise<TranscribeResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    const { data } = await aiApi.post<TranscribeResponse>('/voice/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { language: 'en' },
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
};
