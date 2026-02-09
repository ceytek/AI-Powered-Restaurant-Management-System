import api from './api';

export interface StaffScheduleItem {
  name: string;
  position: string;
  department: string;
  shift: string;
  shift_time: string;
  status: string;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  current_stock: number;
  minimum_stock: number;
  reorder_point: number | null;
  reorder_quantity: number | null;
  unit_cost: number;
  unit: string | null;
  storage_location: string | null;
  stock_percentage: number;
  severity: 'critical' | 'warning' | 'low';
}

export interface CategoryBreakdown {
  name: string;
  item_count: number;
  total_value: number;
  low_stock_count: number;
}

export interface RecentMovement {
  id: string;
  item_name: string;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  stock_after: number | null;
  performed_by: string | null;
  performed_at: string | null;
  notes: string | null;
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
    total_items: number;
    total_value: number;
    low_stock_alerts: number;
    out_of_stock: number;
    waste_last_7_days: number;
    low_stock_items: LowStockItem[];
    category_breakdown: CategoryBreakdown[];
    recent_movements: RecentMovement[];
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
