import api from './api';
import type { PaginatedResponse, Customer, CustomerCreate, CustomerBrief, CustomerNote } from '@/types';

export const customerService = {
  getCustomers: async (params?: {
    page?: number; page_size?: number; search?: string;
    vip?: boolean; tier?: string; is_active?: boolean;
  }) => {
    const { data } = await api.get<PaginatedResponse<Customer>>('/customers', { params });
    return data;
  },
  searchCustomers: async (q: string) => {
    const { data } = await api.get<CustomerBrief[]>('/customers/search', { params: { q } });
    return data;
  },
  getCustomer: async (id: string) => {
    const { data } = await api.get<Customer>(`/customers/${id}`);
    return data;
  },
  createCustomer: async (payload: CustomerCreate) => {
    const { data } = await api.post<Customer>('/customers', payload);
    return data;
  },
  updateCustomer: async (id: string, payload: Partial<CustomerCreate & { is_active: boolean }>) => {
    const { data } = await api.put<Customer>(`/customers/${id}`, payload);
    return data;
  },
  deleteCustomer: async (id: string) => {
    const { data } = await api.delete(`/customers/${id}`);
    return data;
  },
  // Notes
  getNotes: async (customerId: string) => {
    const { data } = await api.get<CustomerNote[]>(`/customers/${customerId}/notes`);
    return data;
  },
  createNote: async (customerId: string, payload: { note_type: string; note: string; is_pinned?: boolean }) => {
    const { data } = await api.post<CustomerNote>(`/customers/${customerId}/notes`, payload);
    return data;
  },
};
