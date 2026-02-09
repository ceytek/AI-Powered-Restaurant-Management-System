import api from './api';
import type { PaginatedResponse, MenuCategory, MenuCategoryCreate, MenuItem, MenuItemCreate, Allergen } from '@/types';

export const menuService = {
  // Categories
  getCategories: async (params?: { parent_id?: string; include_inactive?: boolean }) => {
    const { data } = await api.get<MenuCategory[]>('/menu/categories', { params });
    return data;
  },
  createCategory: async (payload: MenuCategoryCreate) => {
    const { data } = await api.post<MenuCategory>('/menu/categories', payload);
    return data;
  },
  updateCategory: async (id: string, payload: Partial<MenuCategoryCreate & { is_active: boolean }>) => {
    const { data } = await api.put<MenuCategory>(`/menu/categories/${id}`, payload);
    return data;
  },
  deleteCategory: async (id: string) => {
    const { data } = await api.delete(`/menu/categories/${id}`);
    return data;
  },

  // Allergens
  getAllergens: async () => {
    const { data } = await api.get<Allergen[]>('/menu/allergens');
    return data;
  },

  // Items
  getItems: async (params?: {
    page?: number; page_size?: number; search?: string; category_id?: string;
    is_available?: boolean; is_featured?: boolean; is_vegetarian?: boolean;
    min_price?: number; max_price?: number;
  }) => {
    const { data } = await api.get<PaginatedResponse<MenuItem>>('/menu/items', { params });
    return data;
  },
  getItem: async (id: string) => {
    const { data } = await api.get<MenuItem>(`/menu/items/${id}`);
    return data;
  },
  createItem: async (payload: MenuItemCreate) => {
    const { data } = await api.post<MenuItem>('/menu/items', payload);
    return data;
  },
  updateItem: async (id: string, payload: Partial<MenuItemCreate & { is_available: boolean }>) => {
    const { data } = await api.put<MenuItem>(`/menu/items/${id}`, payload);
    return data;
  },
  deleteItem: async (id: string) => {
    const { data } = await api.delete(`/menu/items/${id}`);
    return data;
  },
};
