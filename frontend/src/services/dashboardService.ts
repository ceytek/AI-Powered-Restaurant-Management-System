import api from './api';

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
}

export const dashboardService = {
  getSummary: async () => {
    const { data } = await api.get<DashboardSummary>('/dashboard/summary');
    return data;
  },
};
