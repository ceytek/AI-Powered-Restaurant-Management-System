import api from './api';
import type { PaginatedResponse, StaffPosition, StaffProfile, Shift, StaffSchedule } from '@/types';

export const staffService = {
  // Positions
  getPositions: async (department?: string) => {
    const { data } = await api.get<StaffPosition[]>('/staff/positions', { params: { department } });
    return data;
  },
  createPosition: async (payload: { name: string; department: string; description?: string; base_hourly_rate?: number; color?: string }) => {
    const { data } = await api.post<StaffPosition>('/staff/positions', payload);
    return data;
  },
  updatePosition: async (id: string, payload: Partial<StaffPosition>) => {
    const { data } = await api.put<StaffPosition>(`/staff/positions/${id}`, payload);
    return data;
  },
  // Profiles
  getProfiles: async (params?: {
    page?: number; page_size?: number; search?: string;
    position_id?: string; department?: string; employment_status?: string;
  }) => {
    const { data } = await api.get<PaginatedResponse<StaffProfile>>('/staff/profiles', { params });
    return data;
  },
  getProfile: async (id: string) => {
    const { data } = await api.get<StaffProfile>(`/staff/profiles/${id}`);
    return data;
  },
  createProfile: async (payload: { user_id: string; position_id?: string; employee_number?: string; hire_date?: string; contract_type?: string }) => {
    const { data } = await api.post<StaffProfile>('/staff/profiles', payload);
    return data;
  },
  updateProfile: async (id: string, payload: Partial<StaffProfile>) => {
    const { data } = await api.put<StaffProfile>(`/staff/profiles/${id}`, payload);
    return data;
  },
  // Shifts
  getShifts: async () => {
    const { data } = await api.get<Shift[]>('/staff/shifts');
    return data;
  },
  createShift: async (payload: { name: string; start_time: string; end_time: string; break_duration?: number; color?: string }) => {
    const { data } = await api.post<Shift>('/staff/shifts', payload);
    return data;
  },
  // Schedules
  getSchedules: async (params?: { start_date?: string; end_date?: string; staff_id?: string }) => {
    const { data } = await api.get<StaffSchedule[]>('/staff/schedules', { params });
    return data;
  },
  createSchedule: async (payload: { staff_id: string; shift_id?: string; date: string; section_id?: string; notes?: string }) => {
    const { data } = await api.post<StaffSchedule>('/staff/schedules', payload);
    return data;
  },
  updateSchedule: async (id: string, payload: Partial<{ shift_id: string; status: string; notes: string; section_id: string }>) => {
    const { data } = await api.put<StaffSchedule>(`/staff/schedules/${id}`, payload);
    return data;
  },
  deleteSchedule: async (id: string) => {
    const { data } = await api.delete(`/staff/schedules/${id}`);
    return data;
  },
};
