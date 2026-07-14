// Lazy Socket.IO singleton for the agent app.
//
// F-029: if an agent's socket drops during an ACTIVE session the server
// auto-interrupts and refunds the user — so the socket is connected app-wide
// for the whole authenticated lifetime (login → logout), not per-screen.
// Screens grab the same instance via getSocket()/connectSocket().
import { io, type Socket } from 'socket.io-client';
import { config } from '../config';
import { useAuthStore } from '../stores/authStore';

let socket: Socket | null = null;

/** Returns the current socket without connecting. */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Returns the shared socket, creating and connecting it if needed.
 * The auth token is read lazily on every (re)connect so reconnects after a
 * token refresh use the fresh access token.
 */
export function connectSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (socket) {
    if (socket.disconnected) socket.connect();
    return socket;
  }
  socket = io(config.wsBaseUrl, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken ?? '' }),
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
  return socket;
}

/** Tears the socket down completely. Call on logout only. */
export function disconnectSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
