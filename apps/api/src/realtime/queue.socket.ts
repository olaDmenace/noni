import type { Server, Socket } from 'socket.io';
import { queueService } from '../services/queue.service.js';
import type { JwtPayload } from '../middleware/auth.js';

export function registerQueueHandlers(_io: Server, socket: Socket): void {
  const user = socket.data.user as JwtPayload;

  socket.on('subscribe_queue', async ({ sessionId }: { sessionId: string }) => {
    await socket.join(`queue:${sessionId}`);
    // Push the current position immediately so the UI never shows a blank state.
    const update = await queueService.positionOf(sessionId).catch(() => null);
    if (update) socket.emit('queue_update', update);
  });

  socket.on('unsubscribe_queue', ({ sessionId }: { sessionId: string }) => {
    void socket.leave(`queue:${sessionId}`);
  });

  // F-032: agents accept or pass an assigned session from the socket too
  // (REST endpoints exist as well; this path avoids a round-trip).
  socket.on('accept_session', async ({ sessionId }: { sessionId: string }) => {
    if (user.role !== 'AGENT') return;
    await queueService.accept(user.sub, sessionId).catch((err: Error) => {
      socket.emit('error_event', { code: 'ACCEPT_FAILED', message: err.message, sessionId });
    });
  });
  socket.on('pass_session', async ({ sessionId }: { sessionId: string }) => {
    if (user.role !== 'AGENT') return;
    await queueService.pass(user.sub, sessionId).catch(() => undefined);
  });
}
