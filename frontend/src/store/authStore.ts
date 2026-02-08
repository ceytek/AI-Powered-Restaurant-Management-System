import { create } from 'zustand';
import type { UserResponse, CompanyResponse } from '@/types';
import { authApi } from '@/services/api';

interface AuthState {
  user: UserResponse | null;
  company: CompanyResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (companyCode: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: UserResponse) => void;
  setCompany: (company: CompanyResponse) => void;
  hasPermission: (resource: string, action: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  company: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (companyCode: string, email: string, password: string) => {
    const response = await authApi.login({
      company_code: companyCode,
      email,
      password,
    });

    // Store tokens
    localStorage.setItem('access_token', response.tokens.access_token);
    localStorage.setItem('refresh_token', response.tokens.refresh_token);
    localStorage.setItem('user', JSON.stringify(response.user));
    localStorage.setItem('company', JSON.stringify(response.company));

    set({
      user: response.user,
      company: response.company,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout API errors
    }

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('company');

    set({
      user: null,
      company: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user');
    const savedCompany = localStorage.getItem('company');

    if (!token || !savedUser || !savedCompany) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      // Verify token is still valid by calling /me
      const user = await authApi.getMe();
      const company = JSON.parse(savedCompany) as CompanyResponse;

      set({
        user,
        company,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Token invalid or expired
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('company');

      set({
        user: null,
        company: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  setUser: (user: UserResponse) => set({ user }),
  setCompany: (company: CompanyResponse) => set({ company }),

  hasPermission: (resource: string, action: string) => {
    const { user } = get();
    if (!user) return false;
    const permKey = `${resource}.${action}`;
    return user.permissions.includes(permKey) || user.permissions.includes('admin.all');
  },

  hasRole: (role: string) => {
    const { user } = get();
    if (!user) return false;
    return user.roles.includes(role);
  },
}));
