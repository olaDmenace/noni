import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const prisma = new PrismaClient({
  log:
    env.NODE_ENV === 'development'
      ? [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [{ emit: 'event', level: 'error' }],
});

prisma.$on('warn' as never, (e: unknown) => logger.warn({ prisma: e }, 'prisma warn'));
prisma.$on('error' as never, (e: unknown) => logger.error({ prisma: e }, 'prisma error'));

export type Prisma = typeof prisma;
