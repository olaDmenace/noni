// Service-layer bridge into Socket.IO rooms via Redis pub/sub.
// Services must never import the io instance (circular deps, breaks multi-instance);
// they publish here and realtime/index.ts relays to the room on every instance.
import { redis } from '../models/redis.js';

export const ROOM_CHANNEL_PREFIX = 'noni:room:';

export async function publishToRoom(
  room: string,
  event: string,
  payload: unknown,
): Promise<void> {
  await redis.publish(`${ROOM_CHANNEL_PREFIX}${room}`, JSON.stringify({ event, payload }));
}

// Room naming — single source of truth.
export const rooms = {
  session: (sessionId: string) => `session:${sessionId}`,
  queue: (sessionId: string) => `queue:${sessionId}`,
  user: (userId: string) => `user:${userId}`,
  admins: () => 'admins',
};
