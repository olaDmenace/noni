// Lazy Socket.IO singleton. Connects with the current access token,
// reconnects when the token changes, and exposes disconnect() for logout.
import { io, type Socket } from 'socket.io-client';
import { config } from '../config';
import { useAuthStore } from '../stores/authStore';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(): Socket {
  const token = useAuthStore.getState().accessToken;

  // Token changed (refresh or re-login) — tear down and reconnect fresh.
  if (socket && socketToken !== token) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    socketToken = token;
    socket = io(config.wsBaseUrl, {
      transports: ['websocket'],
      auth: { token },
    });
    // Graceful: socket.io retries automatically; don't crash on handshake failure.
    socket.on('connect_error', (err: Error) => {
      if (__DEV__) {
        console.warn('[socket] connect_error:', err.message);
      }
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socketToken = null;
}
