import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'drivedock_access_token';
const REFRESH_TOKEN_KEY = 'drivedock_refresh_token';
const USER_KEY = 'drivedock_user_data';

export const Storage = {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },

  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    } else {
      return await SecureStore.getItemAsync(key);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },

  async saveAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
    await this.setItem(ACCESS_TOKEN_KEY, accessToken);
    await this.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  async getAccessToken(): Promise<string | null> {
    return await this.getItem(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return await this.getItem(REFRESH_TOKEN_KEY);
  },

  async clearAuth(): Promise<void> {
    await this.removeItem(ACCESS_TOKEN_KEY);
    await this.removeItem(REFRESH_TOKEN_KEY);
    await this.removeItem(USER_KEY);
  }
};
