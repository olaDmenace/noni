import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './models/prisma.js';
import { connectRedis, redis } from './models/redis.js';
import { createSocketServer } from './realtime/index.js';
import { paymentService } from './services/payment.service.js';
import { queueService } from './services/queue.service.js';
import { schedulingService } from './services/scheduling.service.js';
import { sessionService } from './services/session.service.js';
import { subscriptionService } from './services/subscription.service.js';
import { logger } from './utils/logger.js';

const SWEEP_INTERVAL_MS = 15_000;

async function main(): Promise<void> {
  await connectRedis();
  await prisma.$connect();

  const app = createApp();
  const http = createServer(app);
  const io = createSocketServer(http);

  http.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'noni-api listening on 0.0.0.0');
  });

  // Queue sweeper: offer timeouts, stale-queue refunds (F-029), session overruns,
  // and subscription renewals (F-026). Cheap enough to run on every instance.
  let sweeping = false;
  const sweeper = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void (async () => {
      try {
        await queueService.sweep({
          interruptWithRefund: (id, reason) => sessionService.interruptWithRefund(id, reason),
          complete: async (id) => {
            const s = await prisma.session.findUnique({ where: { id } });
            if (s) await sessionService.end(id, s.userId, 'ADMIN');
          },
        });
        await subscriptionService.sweepRenewals();
        await paymentService.pollPendingTopups();
        await schedulingService.sweepDue();
      } catch (err) {
        logger.error({ err }, 'sweep failed');
      } finally {
        sweeping = false;
      }
    })();
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  const shutdown = async (signal: string) => {
    logger.warn({ signal }, 'shutting down');
    io.close();
    http.close();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'fatal: failed to start');
  process.exit(1);
});
