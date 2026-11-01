import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Storage } from '../utils/storage';

const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT || '5001';

// In development the API runs on the same computer as Metro, so reuse the host the app was
// loaded from (e.g. "10.7.25.27:8081" when scanned in Expo Go). Changing Wi-Fi then only needs
// a fresh QR scan, not an edit to mobile/.env.
const devMachineHost = (): string | null => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.hostname || null;
  }
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).expoGoConfig?.debuggerHost;
  return hostUri ? hostUri.split(':')[0] : null;
};

const resolveApiBaseUrl = (): string => {
  // An explicit URL always wins (e.g. the hosted API in builds)
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = __DEV__ ? devMachineHost() : null;
  return `http://${host || 'localhost'}:${DEV_API_PORT}/api/v1`;
};

export const API_BASE_URL = resolveApiBaseUrl();

// Without a timeout a dead connection leaves a screen spinning forever
export const REQUEST_TIMEOUT_MS = 30000;
export const UPLOAD_TIMEOUT_MS = 120000; // photos and PDFs on a slow connection

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json'
  }
});

// The auth store registers this so a dead session sends the user back to the login screen
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: () => void): void => {
  onSessionExpired = handler;
};

// Request interceptor: automatically attaches access token
apiClient.interceptors.request.use(async (config) => {
  const token = await Storage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handles automatic token refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only an expired or invalid access token is worth a refresh. Other 401s (a forged QR on
    // /public/verify, a missing token) would just loop through a pointless refresh.
    const accessTokenRejected = error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED';

    if (accessTokenRejected && !originalRequest._retry && originalRequest.url !== '/auth/login' && originalRequest.url !== '/auth/refresh') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await Storage.getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: REQUEST_TIMEOUT_MS });
        const { accessToken, refreshToken: newRefreshToken } = res.data.data;

        await Storage.saveAuthTokens(accessToken, newRefreshToken);
        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr: any) {
        processQueue(refreshErr, null);
        // Only a refused or missing refresh token ends the session. A network failure just fails
        // this request and keeps the user signed in for the next try.
        const refused = [400, 401, 403].includes(refreshErr?.response?.status) ||
          refreshErr?.message === 'No refresh token available';
        if (refused) {
          await Storage.clearAuth();
          onSessionExpired?.();
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
