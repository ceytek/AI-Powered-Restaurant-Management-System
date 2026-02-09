import api from './api';
import type { PaginatedResponse, MessageResponse, TableSection, TableSectionCreate, RestaurantTable, TableCreate, TableBrief } from '@/types';

export const tableService = {
  // Sections
  getSections: async (params?: { search?: string; is_active?: boolean }) => {
    const { data } = await api.get<PaginatedResponse<TableSection>>('/tables/sections', { params });
    return data;
  },
  createSection: async (payload: TableSectionCreate) => {
    const { data } = await api.post<TableSection>('/tables/sections', payload);
    return data;
  },
  updateSection: async (id: string, payload: Partial<TableSectionCreate & { is_active: boolean }>) => {
    const { data } = await api.put<TableSection>(`/tables/sections/${id}`, payload);
    return data;
  },
  deleteSection: async (id: string) => {
    const { data } = await api.delete<MessageResponse>(`/tables/sections/${id}`);
    return data;
  },

  // Tables
  getTables: async (params?: { page?: number; page_size?: number; search?: string; section_id?: string; status?: string; is_active?: boolean }) => {
    const { data } = await api.get<PaginatedResponse<RestaurantTable>>('/tables', { params });
    return data;
  },
  getTablesBrief: async (status?: string) => {
    const { data } = await api.get<TableBrief[]>('/tables/brief', { params: { status } });
    return data;
  },
  createTable: async (payload: TableCreate) => {
    const { data } = await api.post<RestaurantTable>('/tables', payload);
    return data;
  },
  updateTable: async (id: string, payload: Partial<TableCreate & { status: string; is_active: boolean }>) => {
    const { data } = await api.put<RestaurantTable>(`/tables/${id}`, payload);
    return data;
  },
  updateTableStatus: async (id: string, status: string) => {
    const { data } = await api.patch<RestaurantTable>(`/tables/${id}/status`, { status });
    return data;
  },
  deleteTable: async (id: string) => {
    const { data } = await api.delete<MessageResponse>(`/tables/${id}`);
    return data;
  },
};
