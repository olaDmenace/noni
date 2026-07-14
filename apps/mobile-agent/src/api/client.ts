import { NoniApiClient } from '@noni/api-client';
import { config } from '../config';
import { useAuthStore } from '../stores/authStore';

export const api = new NoniApiClient({
  baseUrl: config.apiBaseUrl,
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: (tokens) => useAuthStore.getState().updateTokens(tokens),
  onUnauthorized: () => useAuthStore.getState().signOut(),
});
