import api from './api';

export interface StaffScheduleItem {
  name: string;
  position: string;
  department: string;
  shift: string;
  shift_time: string;
  status: string;
}

export interface DashboardSummary {
  tables: {
    total: number;
    available: number;
    occupied: number;
    reserved: number;
    occupancy_rate: number;
  };
  reservations_today: {
    total: number;
    expected_guests: number;
    pending: number;
  };
  menu: {
    total_items: number;
  };
  customers: {
    total: number;
    vip: number;
  };
  inventory: {
    low_stock_alerts: number;
  };
  staff: {
    total_active: number;
    on_leave: number;
    today_scheduled: number;
    departments: Record<string, number>;
    today_staff: StaffScheduleItem[];
  };
}

export const dashboardService = {
  getSummary: async () => {
    const { data } = await api.get<DashboardSummary>('/dashboard/summary');
    return data;
  },
};
