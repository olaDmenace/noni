import type { Server, Socket } from 'socket.io';
import type { WsMessageEvent } from '@noni/types';
import { logger } from '../utils/logger.js';
import { safetyService } from '../services/safety.service.js';
import { sessionService } from '../services/session.service.js';
import type { JwtPayload } from '../middleware/auth.js';

interface JoinPayload {
  sessionId: string;
}
interface SendMessagePayload {
  sessionId: string;
  text: string;
}
interface SignalPayload {
  sessionId: string;
  data: unknown;
}

export function registerSessionHandlers(io: Server, socket: Socket): void {
  const user = socket.data.user as JwtPayload;

  socket.on('join_room', async ({ sessionId }: JoinPayload) => {
    // Only the session's user, its agent, or an admin may join the room.
    const allowed = await sessionService.isParticipant(sessionId, user.sub, user.role);
    if (!allowed) {
      socket.emit('error_event', { code: 'NOT_PARTICIPANT', sessionId });
      return;
    }
    await socket.join(`session:${sessionId}`);
    logger.debug({ sessionId, socket: socket.id }, 'joined session room');
  });

  socket.on('send_message', async ({ sessionId, text }: SendMessagePayload) => {
    if (!sessionId || !text?.trim()) return;
    if (!socket.rooms.has(`session:${sessionId}`)) return;

    // Safety gate — every text message scanned (S-001).
    const crisis = safetyService.hasCrisisKeyword(text);
    if (crisis.detected) {
      io.to(`session:${sessionId}`).emit('crisis_alert', {
        message: crisis.responseMessage,
        hotlineNumber: crisis.hotline,
      });
      await safetyService.triggerCrisisProtocol({
        sessionId,
        triggeredBy: 'KEYWORD',
        triggerSource: user.role === 'AGENT' ? 'AGENT' : 'USER',
        matchedKeyword: crisis.matchedKeyword,
      });
    }

    // Forward — content NEVER persisted.
    const event: WsMessageEvent = {
      text,
      sender: user.role === 'AGENT' ? 'AGENT' : 'USER',
      timestamp: Date.now(),
    };
    socket.to(`session:${sessionId}`).emit('message', event);
  });

  // F-015 typing indicators — relay only, never stored.
  socket.on('typing_start', ({ sessionId }: JoinPayload) => {
    if (socket.rooms.has(`session:${sessionId}`)) {
      socket.to(`session:${sessionId}`).emit('typing_start', { sender: user.role });
    }
  });
  socket.on('typing_stop', ({ sessionId }: JoinPayload) => {
    if (socket.rooms.has(`session:${sessionId}`)) {
      socket.to(`session:${sessionId}`).emit('typing_stop', { sender: user.role });
    }
  });

  // F-016 quick reactions — allowlisted emoji, relay-only, never stored.
  const ALLOWED_REACTIONS = ['❤️', '🙏', '😢'];
  socket.on('reaction', ({ sessionId, emoji }: { sessionId: string; emoji: string }) => {
    if (!ALLOWED_REACTIONS.includes(emoji)) return;
    if (socket.rooms.has(`session:${sessionId}`)) {
      socket.to(`session:${sessionId}`).emit('reaction', {
        emoji,
        sender: user.role === 'AGENT' ? 'AGENT' : 'USER',
        timestamp: Date.now(),
      });
    }
  });

  // F-013 WebRTC signalling relay for voice sessions. Payloads are opaque
  // (SDP offers/answers, ICE candidates) — forwarded, never inspected or stored.
  for (const evt of ['webrtc_offer', 'webrtc_answer', 'webrtc_ice'] as const) {
    socket.on(evt, ({ sessionId, data }: SignalPayload) => {
      if (socket.rooms.has(`session:${sessionId}`)) {
        socket.to(`session:${sessionId}`).emit(evt, { sessionId, data });
      }
    });
  }

  socket.on('leave_room', ({ sessionId }: JoinPayload) => {
    void socket.leave(`session:${sessionId}`);
  });
}
