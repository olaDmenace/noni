import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pubClient, subClient } from '../models/redis.js';
import { logger } from '../utils/logger.js';
import { registerSessionHandlers } from './session.socket.js';
import { registerQueueHandlers } from './queue.socket.js';
import { ROOM_CHANNEL_PREFIX, rooms } from './publish.js';
import { sessionService } from '../services/session.service.js';
import type { JwtPayload } from '../middleware/auth.js';

export function createSocketServer(http: HttpServer): Server {
  const io = new Server(http, {
    cors: { origin: '*', credentials: true },
    transports: ['websocket'],
  });

  io.adapter(createAdapter(pubClient, subClient));

  // Relay service-layer events (crisis alerts, queue updates, session lifecycle)
  // into socket rooms. This is what makes S-003 crisis broadcasts actually reach
  // both parties — the adapter's subClient is owned by socket.io, so use our own.
  const relaySub = pubClient.duplicate();
  relaySub
    .psubscribe(`${ROOM_CHANNEL_PREFIX}*`)
    .catch((err: unknown) => logger.error({ err }, 'relay psubscribe failed'));
  relaySub.on('pmessage', (_pattern, channel, raw) => {
    try {
      const room = channel.slice(ROOM_CHANNEL_PREFIX.length);
      const { event, payload } = JSON.parse(raw) as { event: string; payload: unknown };
      io.local.to(room).emit(event, payload);
    } catch (err) {
      logger.error({ err, channel }, 'relay message failed');
    }
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    if (!token) return next(new Error('NO_TOKEN'));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JwtPayload;
    logger.debug({ socket: socket.id, user: user.sub }, 'socket connected');

    // Personal room — session assignment, wallet and admin events land here.
    void socket.join(rooms.user(user.sub));
    if (user.role === 'ADMIN') void socket.join(rooms.admins());

    registerSessionHandlers(io, socket);
    registerQueueHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ socket: socket.id, reason }, 'socket disconnected');
      // F-029: if an agent drops mid-session, interrupt + auto-refund the user.
      if (user.role === 'AGENT') {
        void sessionService.handleAgentDisconnect(user.sub);
      }
    });
  });

  return io;
}
