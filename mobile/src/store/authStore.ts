import { create } from 'zustand';
import { AuthAPI } from '../api/endpoints';
import { Storage } from '../utils/storage';

export type UserRole = 'owner' | 'provider' | 'officer' | 'government' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  address?: {
    city: string;
    state: string;
    pincode: string;
  };
  provider?: any;
}

interface AuthState {
  user: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  signup: (payload: any) => Promise<void>;
  quickDemoLogin: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

const DEMO_CREDENTIALS: Record<UserRole, { email: string; pass: string }> = {
  owner: { email: 'owner@drivedock.com', pass: 'password123' },
  provider: { email: 'provider@drivedock.com', pass: 'password123' },
  officer: { email: 'officer@drivedock.com', pass: 'password123' },
  government: { email: 'gov@drivedock.com', pass: 'password123' },
  admin: { email: 'admin@drivedock.com', pass: 'password123' }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await AuthAPI.login({ email, password });
      const { user, accessToken, refreshToken } = res.data.data;

      await Storage.saveAuthTokens(accessToken, refreshToken);
      set({
        user,
        role: user.role,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Login failed. Please check credentials.';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  signup: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      const res = await AuthAPI.signup(payload);
      const { user, accessToken, refreshToken } = res.data.data;

      await Storage.saveAuthTokens(accessToken, refreshToken);
      set({
        user,
        role: user.role,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Signup failed.';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  quickDemoLogin: async (role: UserRole) => {
    const creds = DEMO_CREDENTIALS[role];
    if (creds) {
      await get().login(creds.email, creds.pass);
    }
  },

  logout: async () => {
    await Storage.clearAuth();
    set({
      user: null,
      role: null,
      isAuthenticated: false,
      isLoading: false
    });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const token = await Storage.getAccessToken();
      if (!token) {
        set({ isAuthenticated: false, user: null, role: null, isLoading: false });
        return;
      }

      const res = await AuthAPI.getMe();
      const user = res.data.data.user;
      set({
        user,
        role: user.role,
        isAuthenticated: true,
        isLoading: false
      });
    } catch (err) {
      await Storage.clearAuth();
      set({ isAuthenticated: false, user: null, role: null, isLoading: false });
    }
  }
}));
