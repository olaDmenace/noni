import { Router } from 'express';
import { prisma } from '../models/prisma.js';
import { redis } from '../models/redis.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const healthRouter = Router();

healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

healthRouter.get(
  '/readyz',
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then((r) => r === 'PONG').catch(() => false),
    ]);
    const ready = dbOk && redisOk;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', dbOk, redisOk });
  }),
);
