import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { User } from '@noni/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setSession: (args: { user: User; accessToken: string; refreshToken: string }) => Promise<void>;
  updateTokens: (args: {
    user: User;
    accessToken: string;
    refreshToken: string;
  }) => Promise<void>;
  patchUser: (patch: Partial<User>) => Promise<void>;
  signOut: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const ACCESS_KEY = 'noni.access';
const REFRESH_KEY = 'noni.refresh';
const USER_KEY = 'noni.user';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  hydrated: false,

  async setSession({ user, accessToken, refreshToken }) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, accessToken, refreshToken });
  },

  async updateTokens({ user, accessToken, refreshToken }) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
    set({ user, accessToken, refreshToken });
  },

  async patchUser(patch) {
    const current = useAuthStore.getState().user;
    if (!current) return;
    const next = { ...current, ...patch };
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(next));
    set({ user: next });
  },

  async signOut() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  async hydrate() {
    const [access, refresh, userStr] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    set({
      accessToken: access,
      refreshToken: refresh,
      user: userStr ? (JSON.parse(userStr) as User) : null,
      hydrated: true,
    });
  },
}));
