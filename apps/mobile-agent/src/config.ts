import Constants from 'expo-constants';

interface AppConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppConfig>;

// In dev (Expo Go / dev client) the phone reaches Metro via the PC's current LAN
// IP (hostUri). Local http:// URLs go stale when DHCP reassigns that IP, so swap
// their host for the Metro host. Cloud https:// URLs are never rewritten.
function withDevHost(url: string): string {
  if (url.startsWith('https://') || url.startsWith('wss://')) return url;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host || !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return url;
  return url.replace(/\/\/[^:/]+/, `//${host}`);
}

// process.env.EXPO_PUBLIC_* MUST be accessed literally: Expo inlines the value at
// bundle time, and any indirect access (destructuring, aliasing) resolves to
// undefined in release builds — which is how localhost once shipped to production.
export const config: AppConfig = {
  apiBaseUrl: withDevHost(
    process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl ?? 'https://noni-api.onrender.com',
  ),
  wsBaseUrl: withDevHost(
    process.env.EXPO_PUBLIC_WS_BASE_URL ?? extra.wsBaseUrl ?? 'wss://noni-api.onrender.com',
  ),
};
