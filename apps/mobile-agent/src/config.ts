import Constants from 'expo-constants';

interface AppConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
}

type ExpoEnv = { EXPO_PUBLIC_API_BASE_URL?: string; EXPO_PUBLIC_WS_BASE_URL?: string };
const env = ((globalThis as { process?: { env?: ExpoEnv } }).process?.env ?? {}) as ExpoEnv;
const extra = (Constants.expoConfig?.extra ?? {}) as Partial<AppConfig>;

// In dev the phone reaches Metro via the PC's current LAN IP (hostUri), but the
// API URL in .env goes stale every time DHCP reassigns the IP. Swap the host of
// the configured URL for the Metro host so the API always follows the PC.
function withDevHost(url: string): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host || !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return url;
  return url.replace(/\/\/[^:/]+/, `//${host}`);
}

export const config: AppConfig = {
  apiBaseUrl: withDevHost(env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl ?? 'http://localhost:3000'),
  wsBaseUrl: withDevHost(env.EXPO_PUBLIC_WS_BASE_URL ?? extra.wsBaseUrl ?? 'ws://localhost:3000'),
};
