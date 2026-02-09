/* ============================================
   Shared API types for the Restaurant Management System
   ============================================ */

// ==================== Common ====================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface MessageResponse {
  message: string;
  success: boolean;
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
  search?: string;
  order_by?: string;
  order_dir?: 'asc' | 'desc';
}

// ==================== Table Sections ====================

export interface TableSection {
  id: string;
  name: string;
  description?: string;
  floor: number;
  color?: string;
  sort_order: number;
  is_smoking: boolean;
  is_outdoor: boolean;
  is_active: boolean;
  table_count: number;
  created_at: string;
  updated_at: string;
}

export interface TableSectionCreate {
  name: string;
  description?: string;
  floor?: number;
  color?: string;
  sort_order?: number;
  is_smoking?: boolean;
  is_outdoor?: boolean;
}

// ==================== Tables ====================

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning';

export interface RestaurantTable {
  id: string;
  section_id?: string;
  section_name?: string;
  table_number: string;
  name?: string;
  capacity_min: number;
  capacity_max: number;
  shape: string;
  status: TableStatus;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  qr_code?: string;
  is_reservable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TableCreate {
  section_id?: string;
  table_number: string;
  name?: string;
  capacity_min?: number;
  capacity_max: number;
  shape?: string;
  is_reservable?: boolean;
}

export interface TableBrief {
  id: string;
  table_number: string;
  name?: string;
  capacity_max: number;
  status: TableStatus;
  section_name?: string;
}

// ==================== Menu ====================

export interface MenuCategory {
  id: string;
  parent_id?: string;
  name: string;
  description?: string;
  image_url?: string;
  sort_order: number;
  is_active: boolean;
  item_count: number;
  children: MenuCategory[];
  created_at: string;
}

export interface MenuCategoryCreate {
  parent_id?: string;
  name: string;
  description?: string;
  image_url?: string;
  sort_order?: number;
}

export interface Allergen {
  id: string;
  name: string;
  code?: string;
  icon?: string;
  description?: string;
  severity_level: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category_id?: string;
  category_name?: string;
  name: string;
  description?: string;
  short_description?: string;
  price: string;
  cost_price?: string;
  currency: string;
  image_url?: string;
  thumbnail_url?: string;
  calories?: number;
  preparation_time?: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  is_halal: boolean;
  is_kosher: boolean;
  is_spicy: boolean;
  spice_level: number;
  is_available: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_seasonal: boolean;
  sort_order: number;
  allergens: Allergen[];
  variants: MenuItemVariant[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface MenuItemCreate {
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  cost_price?: number;
  calories?: number;
  preparation_time?: number;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  is_spicy?: boolean;
  spice_level?: number;
  is_available?: boolean;
  is_featured?: boolean;
  allergen_ids?: string[];
  tags?: string[];
}

export interface MenuItemVariant {
  id?: string;
  name: string;
  price_modifier: string;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
}

// ==================== Inventory ====================

export interface InventoryCategory {
  id: string;
  parent_id?: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  item_count: number;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  category_id?: string;
  category_name?: string;
  unit_id?: string;
  unit_name?: string;
  unit_abbreviation?: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  current_stock: string;
  minimum_stock: string;
  maximum_stock?: string;
  reorder_point?: string;
  unit_cost: string;
  storage_location?: string;
  storage_temperature?: string;
  expiry_tracking: boolean;
  image_url?: string;
  is_low_stock: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItemCreate {
  category_id?: string;
  unit_id?: string;
  name: string;
  description?: string;
  sku?: string;
  current_stock?: number;
  minimum_stock?: number;
  unit_cost?: number;
  storage_location?: string;
  storage_temperature?: string;
  expiry_tracking?: boolean;
}

export interface StockMovement {
  id: string;
  inventory_item_id: string;
  inventory_item_name?: string;
  movement_type: string;
  quantity: string;
  unit_cost?: string;
  total_cost?: string;
  stock_before?: string;
  stock_after?: string;
  reference_type?: string;
  batch_number?: string;
  expiry_date?: string;
  notes?: string;
  performed_by_name?: string;
  performed_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  payment_terms?: string;
  rating?: number;
  is_active: boolean;
  created_at: string;
}

// ==================== Staff ====================

export interface StaffPosition {
  id: string;
  name: string;
  department: string;
  description?: string;
  base_hourly_rate?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
  staff_count: number;
  created_at: string;
}

export interface StaffProfile {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  position_id?: string;
  position_name?: string;
  department?: string;
  employee_number?: string;
  hire_date?: string;
  birth_date?: string;
  address?: string;
  city?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  hourly_rate?: string;
  contract_type: string;
  max_weekly_hours?: number;
  profile_image_url?: string;
  employment_status: string;
  created_at: string;
}

export interface StaffSchedule {
  id: string;
  staff_id: string;
  staff_name?: string;
  shift_id?: string;
  shift_name?: string;
  date: string;
  status: string;
  section_name?: string;
  notes?: string;
  created_at: string;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_duration: number;
  color?: string;
  is_active: boolean;
}

// ==================== Reservations ====================

export type ReservationStatus = 'pending' | 'confirmed' | 'reminder_sent' | 'checked_in' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  reservation_number: string;
  customer_id?: string;
  table_id?: string;
  table_number?: string;
  section_name?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  party_size: number;
  date: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  status: ReservationStatus;
  source: string;
  source_details?: string;
  special_requests?: string;
  internal_notes?: string;
  tags?: string[];
  dietary_notes?: string;
  confirmation_sent: boolean;
  reminder_sent: boolean;
  confirmed_at?: string;
  seated_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ReservationCreate {
  customer_id?: string;
  table_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  party_size: number;
  date: string;
  start_time: string;
  duration_minutes?: number;
  source?: string;
  special_requests?: string;
  internal_notes?: string;
}

export interface ReservationBrief {
  id: string;
  reservation_number: string;
  customer_name: string;
  party_size: number;
  date: string;
  start_time: string;
  status: ReservationStatus;
  table_number?: string;
}

// ==================== Customers ====================

export interface Customer {
  id: string;
  first_name: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  secondary_phone?: string;
  date_of_birth?: string;
  gender?: string;
  preferred_language: string;
  address?: string;
  city?: string;
  country?: string;
  dietary_preferences?: string[];
  allergies?: string[];
  seating_preference?: string;
  vip_status: boolean;
  loyalty_points: number;
  customer_tier: string;
  tags?: string[];
  total_visits: number;
  total_spent: string;
  average_spend: string;
  total_no_shows: number;
  total_cancellations: number;
  last_visit_date?: string;
  source: string;
  marketing_consent: boolean;
  is_blacklisted: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreate {
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  vip_status?: boolean;
  tags?: string[];
  source?: string;
}

export interface CustomerBrief {
  id: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
  vip_status: boolean;
  total_visits: number;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  note_type: string;
  note: string;
  is_pinned: boolean;
  is_private: boolean;
  created_by_name?: string;
  created_at: string;
}
