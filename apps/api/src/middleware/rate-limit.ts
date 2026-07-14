import rateLimit from 'express-rate-limit';
import RedisStore, { type RedisReply } from 'rate-limit-redis';
import { redis } from '../models/redis.js';

const sendCommand = (...args: string[]): Promise<RedisReply> => {
  const [command, ...rest] = args as [string, ...string[]];
  return redis.call(command, ...rest) as Promise<RedisReply>;
};

// Per-IP global limit. See arch §9.1.
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: 'rl:general:' }),
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand, prefix: 'rl:auth:' }),
});
