// Minimal typing for Expo's build-time env inlining (EXPO_PUBLIC_*).
// (The user app gets `process` typed transitively; this workspace does not.)
declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_WS_BASE_URL?: string;
    NODE_ENV?: string;
  };
};
