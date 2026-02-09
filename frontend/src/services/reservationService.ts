import api from './api';
import type { PaginatedResponse, Reservation, ReservationCreate, ReservationBrief } from '@/types';

export const reservationService = {
  getReservations: async (params?: {
    page?: number; page_size?: number; search?: string;
    status?: string; start_date?: string; end_date?: string;
    table_id?: string; source?: string;
  }) => {
    const { data } = await api.get<PaginatedResponse<Reservation>>('/reservations', { params });
    return data;
  },
  getTodayReservations: async () => {
    const { data } = await api.get<ReservationBrief[]>('/reservations/today');
    return data;
  },
  getReservation: async (id: string) => {
    const { data } = await api.get<Reservation>(`/reservations/${id}`);
    return data;
  },
  createReservation: async (payload: ReservationCreate) => {
    const { data } = await api.post<Reservation>('/reservations', payload);
    return data;
  },
  updateReservation: async (id: string, payload: Partial<ReservationCreate>) => {
    const { data } = await api.put<Reservation>(`/reservations/${id}`, payload);
    return data;
  },
  updateStatus: async (id: string, status: string, notes?: string, cancellation_reason?: string) => {
    const { data } = await api.patch<Reservation>(`/reservations/${id}/status`, {
      status, notes, cancellation_reason,
    });
    return data;
  },
  getHistory: async (id: string) => {
    const { data } = await api.get(`/reservations/${id}/history`);
    return data;
  },
};
