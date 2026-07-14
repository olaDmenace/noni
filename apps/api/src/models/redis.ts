import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const baseOpts = {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
  reconnectOnError: () => true,
};

export const redis = new Redis(env.REDIS_URL, baseOpts);
redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
redis.on('connect', () => logger.info('redis connected'));
redis.on('ready', () => logger.info('redis ready'));

// Separate pub/sub clients are required by socket.io's redis adapter.
export const pubClient = new Redis(env.REDIS_URL, {
  ...baseOpts,
  maxRetriesPerRequest: null,
});
export const subClient = pubClient.duplicate();

async function ensureConnected(client: Redis): Promise<void> {
  if (client.status === 'ready' || client.status === 'connecting' || client.status === 'connect') {
    return;
  }
  await client.connect();
}

export async function connectRedis(): Promise<void> {
  try {
    await Promise.all([
      ensureConnected(redis),
      ensureConnected(pubClient),
      ensureConnected(subClient),
    ]);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'redis: initial connect failed');
    throw err;
  }
}
