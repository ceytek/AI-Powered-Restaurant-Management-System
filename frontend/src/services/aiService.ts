import axios from 'axios';

const AI_URL = import.meta.env.VITE_AI_URL || '/ai';

const aiApi = axios.create({
  baseURL: AI_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to AI service requests
aiApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ==================== Types ====================

export interface KnowledgeCategory {
  id: string;
  company_id: string;
  name: string;
  display_name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface KnowledgeEntry {
  id: string;
  company_id: string;
  category_id?: string;
  title: string;
  content: string;
  short_answer?: string;
  keywords: string[];
  entry_type: string;
  priority: number;
  extra_data: Record<string, unknown>;
  is_active: boolean;
  has_embedding: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SearchResult {
  id: string;
  source: string;
  title: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SyncStatus {
  menu_items_synced: number;
  knowledge_entries_with_embeddings: number;
  knowledge_entries_total: number;
  last_sync?: string;
}

// ==================== Service ====================

export const aiService = {
  // Health
  health: async () => {
    const { data } = await aiApi.get('/health');
    return data;
  },

  // Categories
  getCategories: async (companyId: string) => {
    const { data } = await aiApi.get<KnowledgeCategory[]>('/knowledge/categories', {
      params: { company_id: companyId },
    });
    return data;
  },

  createCategory: async (companyId: string, payload: { name: string; display_name: string; description?: string; icon?: string; sort_order?: number }) => {
    const { data } = await aiApi.post<KnowledgeCategory>(`/knowledge/categories?company_id=${companyId}`, payload);
    return data;
  },

  // Entries
  getEntries: async (companyId: string, params: { category_id?: string; entry_type?: string; search?: string; page?: number; page_size?: number } = {}) => {
    const { data } = await aiApi.get('/knowledge/entries', {
      params: { company_id: companyId, ...params },
    });
    return data;
  },

  createEntry: async (companyId: string, payload: { title: string; content: string; category_id?: string; short_answer?: string; keywords?: string[]; entry_type?: string; priority?: number; extra_data?: Record<string, unknown> }, autoEmbed = true) => {
    const { data } = await aiApi.post<KnowledgeEntry>(`/knowledge/entries?company_id=${companyId}&auto_embed=${autoEmbed}`, payload);
    return data;
  },

  updateEntry: async (companyId: string, entryId: string, payload: Partial<KnowledgeEntry>, reEmbed = true) => {
    const { data } = await aiApi.put<KnowledgeEntry>(`/knowledge/entries/${entryId}?company_id=${companyId}&re_embed=${reEmbed}`, payload);
    return data;
  },

  deleteEntry: async (companyId: string, entryId: string) => {
    const { data } = await aiApi.delete(`/knowledge/entries/${entryId}?company_id=${companyId}`);
    return data;
  },

  // Search
  semanticSearch: async (companyId: string, query: string, searchType = 'all', limit = 5) => {
    const { data } = await aiApi.post<{ query: string; results: SearchResult[]; total: number }>(
      `/knowledge/search?company_id=${companyId}`,
      { query, search_type: searchType, limit }
    );
    return data;
  },

  // Sync
  getSyncStatus: async (companyId: string) => {
    const { data } = await aiApi.get<SyncStatus>('/knowledge/sync/status', {
      params: { company_id: companyId },
    });
    return data;
  },

  syncMenuEmbeddings: async (companyId: string) => {
    const { data } = await aiApi.post(`/knowledge/sync/menu-embeddings?company_id=${companyId}`);
    return data;
  },

  syncKnowledgeEmbeddings: async (companyId: string) => {
    const { data } = await aiApi.post(`/knowledge/sync/knowledge-embeddings?company_id=${companyId}`);
    return data;
  },
};

export default aiApi;
