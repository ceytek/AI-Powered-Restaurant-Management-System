import api from './api';
import type { PaginatedResponse, InventoryCategory, InventoryItem, InventoryItemCreate, StockMovement, Supplier } from '@/types';

export const inventoryService = {
  // Categories
  getCategories: async () => {
    const { data } = await api.get<InventoryCategory[]>('/inventory/categories');
    return data;
  },
  createCategory: async (payload: { name: string; description?: string }) => {
    const { data } = await api.post<InventoryCategory>('/inventory/categories', payload);
    return data;
  },
  // Items
  getItems: async (params?: {
    page?: number; page_size?: number; search?: string;
    category_id?: string; low_stock?: boolean; is_active?: boolean;
  }) => {
    const { data } = await api.get<PaginatedResponse<InventoryItem>>('/inventory/items', { params });
    return data;
  },
  getItem: async (id: string) => {
    const { data } = await api.get<InventoryItem>(`/inventory/items/${id}`);
    return data;
  },
  createItem: async (payload: InventoryItemCreate) => {
    const { data } = await api.post<InventoryItem>('/inventory/items', payload);
    return data;
  },
  updateItem: async (id: string, payload: Partial<InventoryItemCreate & { is_active: boolean }>) => {
    const { data } = await api.put<InventoryItem>(`/inventory/items/${id}`, payload);
    return data;
  },
  deleteItem: async (id: string) => {
    const { data } = await api.delete(`/inventory/items/${id}`);
    return data;
  },
  // Stock Movements
  getMovements: async (params?: {
    page?: number; page_size?: number;
    inventory_item_id?: string; movement_type?: string;
  }) => {
    const { data } = await api.get<PaginatedResponse<StockMovement>>('/inventory/stock-movements', { params });
    return data;
  },
  createMovement: async (payload: {
    inventory_item_id: string; movement_type: string;
    quantity: number; unit_cost?: number; notes?: string;
  }) => {
    const { data } = await api.post<StockMovement>('/inventory/stock-movements', payload);
    return data;
  },
  // Suppliers
  getSuppliers: async (params?: { page?: number; page_size?: number; search?: string }) => {
    const { data } = await api.get<PaginatedResponse<Supplier>>('/inventory/suppliers', { params });
    return data;
  },
  createSupplier: async (payload: Partial<Supplier>) => {
    const { data } = await api.post<Supplier>('/inventory/suppliers', payload);
    return data;
  },
};
