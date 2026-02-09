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

export const aiService = {
  /** Start a new phone call simulation */
  startCall: async (companyId: string, customerPhone?: string): Promise<ChatResponse> => {
    const params: Record<string, string> = { company_id: companyId };
    if (customerPhone) params.customer_phone = customerPhone;
    const { data } = await aiApi.post<ChatResponse>('/chat/start', null, { params });
    return data;
  },

  /** Send a message in the conversation */
  sendMessage: async (companyId: string, request: ChatRequest): Promise<ChatResponse> => {
    const { data } = await aiApi.post<ChatResponse>('/chat', request, {
      params: { company_id: companyId },
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
