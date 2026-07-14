// Queue + matching engine (F-007, F-008, F-032).
//
// Data model: one Redis sorted set `queue:waiting`, member = sessionId,
// score = enqueue-time ms. Priority sessions (T2, isPriority, T7 subscribers)
// get score - PRIORITY_OFFSET so they always sort ahead of normal traffic
// while preserving FIFO within each class.
//
// Assignment (F-032): a matched session keeps its zset entry and QUEUED status;
// `agentId` + `assignedAt` mark the offer. The agent has ACCEPT_WINDOW_SECS to
// accept — on accept the entry is removed and the session goes ACTIVE; on pass
// or timeout the agent lands in the session's passed-set and matching reruns.
import type { WsQueueUpdateEvent } from '@noni/types';
import { TIER_PRICING } from '@noni/types';
import { prisma } from '../models/prisma.js';
import { redis } from '../models/redis.js';
import { publishToRoom, rooms } from '../realtime/publish.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';

const WAITING_ZSET = 'queue:waiting';
const PRIORITY_OFFSET = 10 ** 13; // > any epoch-ms delta; guarantees priority class sorts first
const ACCEPT_WINDOW_SECS = 60; // F-032
const AVG_SESSION_SECS = 15 * 60; // crude wait estimate until real telemetry exists
const passedKey = (sessionId: string) => `queue:passed:${sessionId}`;

export const queueService = {
  async enqueue(sessionId: string, opts: { priority: boolean }): Promise<WsQueueUpdateEvent> {
    const score = Date.now() - (opts.priority ? PRIORITY_OFFSET : 0);
    await redis.zadd(WAITING_ZSET, score, sessionId);
    await this.matchNext();
    return this.positionOf(sessionId);
  },

  async remove(sessionId: string): Promise<void> {
    await redis.zrem(WAITING_ZSET, sessionId);
    await redis.del(passedKey(sessionId));
    await this.broadcastPositions();
  },

  async positionOf(sessionId: string): Promise<WsQueueUpdateEvent> {
    const rank = await redis.zrank(WAITING_ZSET, sessionId);
    if (rank === null) throw NotFound('NOT_QUEUED', 'Session is not in the queue');
    return { position: rank + 1, estimatedWaitSecs: rank * AVG_SESSION_SECS };
  },

  /** Push fresh positions to every queued session's room. */
  async broadcastPositions(): Promise<void> {
    const members = await redis.zrange(WAITING_ZSET, 0, -1);
    await Promise.all(
      members.map((sessionId, idx) =>
        publishToRoom(rooms.queue(sessionId), 'queue_update', {
          position: idx + 1,
          estimatedWaitSecs: idx * AVG_SESSION_SECS,
        } satisfies WsQueueUpdateEvent),
      ),
    );
  },

  /** Offer the longest-waiting compatible session to an available agent. */
  async matchNext(): Promise<void> {
    const waiting = await redis.zrange(WAITING_ZSET, 0, 24);
    for (const sessionId of waiting) {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session || session.status !== 'QUEUED') {
        await redis.zrem(WAITING_ZSET, sessionId);
        continue;
      }
      if (session.agentId) continue; // offer already pending with an agent

      const passed = await redis.smembers(passedKey(sessionId));
      const blocked = await prisma.agentBlock.findMany({
        where: { userId: session.userId },
        select: { agentId: true },
      });
      const excluded = [...passed, ...blocked.map((b) => b.agentId)];

      const agent = await prisma.agent.findFirst({
        where: {
          status: 'AVAILABLE',
          isSuspended: false,
          crisisTrainingPassedAt: { not: null },
          sessionTypes: { has: session.sessionType },
          ...(excluded.length ? { id: { notIn: excluded } } : {}),
        },
        orderBy: { updatedAt: 'asc' }, // least-recently-touched agent first
      });
      if (!agent) continue;

      await prisma.$transaction([
        prisma.session.update({
          where: { id: sessionId },
          data: { agentId: agent.id, assignedAt: new Date() },
        }),
        prisma.agent.update({ where: { id: agent.id }, data: { status: 'BUSY' } }),
      ]);

      await publishToRoom(rooms.user(agent.userId), 'session_assigned', {
        sessionId,
        tier: session.tier,
        sessionType: session.sessionType,
        isPriority: session.isPriority,
        acceptWindowSecs: ACCEPT_WINDOW_SECS,
      });
      await notificationService.push(agent.userId, {
        title: 'New session request',
        body: 'Someone is waiting to talk. Accept within 60 seconds.',
        data: { sessionId, type: 'SESSION_ASSIGNED' },
      });
    }
  },

  /** F-032 accept: agent takes the offered session; it goes ACTIVE. */
  async accept(agentUserId: string, sessionId: string) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.agentId !== agent.id || session.status !== 'QUEUED') {
      throw BadRequest('NOT_ASSIGNED', 'Session is no longer assigned to you');
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });
    await redis.zrem(WAITING_ZSET, sessionId);
    await redis.del(passedKey(sessionId));

    await publishToRoom(rooms.queue(sessionId), 'agent_joined', {
      agentAlias: agent.alias,
      sessionType: session.sessionType,
    });
    await publishToRoom(rooms.session(sessionId), 'agent_joined', {
      agentAlias: agent.alias,
      sessionType: session.sessionType,
    });
    await this.broadcastPositions();
    return updated;
  },

  /** F-032 pass: agent declines; session reoffered to the next agent. */
  async pass(agentUserId: string, sessionId: string): Promise<void> {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) return;
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.agentId !== agent.id || session.status !== 'QUEUED') return;

    await redis.sadd(passedKey(sessionId), agent.id);
    await redis.expire(passedKey(sessionId), 60 * 60);
    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: { agentId: null, assignedAt: null },
      }),
      prisma.agent.update({ where: { id: agent.id }, data: { status: 'AVAILABLE' } }),
    ]);
    await this.matchNext();
  },

  /**
   * Periodic sweep — call from a setInterval in index.ts. Handles:
   *  - offer timeouts (agent never accepted within the window) → reoffer
   *  - stale queued sessions (> maxWaitMins) → interrupt + auto-refund (F-029)
   *  - overrun ACTIVE sessions (past tier duration + grace) → complete
   */
  async sweep(deps: {
    interruptWithRefund: (sessionId: string, reason: string) => Promise<void>;
    complete: (sessionId: string) => Promise<void>;
  }): Promise<void> {
    const now = Date.now();

    const expiredOffers = await prisma.session.findMany({
      where: {
        status: 'QUEUED',
        agentId: { not: null },
        assignedAt: { lt: new Date(now - ACCEPT_WINDOW_SECS * 1000) },
      },
      include: { agent: true },
    });
    for (const s of expiredOffers) {
      if (s.agent) await this.pass(s.agent.userId, s.id).catch(() => undefined);
    }

    const MAX_WAIT_MS = 15 * 60 * 1000;
    const stale = await prisma.session.findMany({
      where: { status: 'QUEUED', agentId: null, createdAt: { lt: new Date(now - MAX_WAIT_MS) } },
      select: { id: true },
    });
    for (const s of stale) {
      await deps.interruptWithRefund(s.id, 'QUEUE_TIMEOUT').catch((err: unknown) =>
        logger.error({ err, sessionId: s.id }, 'sweep: refund failed'),
      );
    }

    const active = await prisma.session.findMany({
      where: { status: 'ACTIVE', durationSecs: null, startedAt: { not: null } },
      select: { id: true, startedAt: true, tier: true },
    });
    for (const s of active) {
      const limit = TIER_PRICING[s.tier as keyof typeof TIER_PRICING]?.durationSecs;
      if (!limit || !s.startedAt) continue;
      if (now - s.startedAt.getTime() > (limit + 60) * 1000) {
        await deps.complete(s.id).catch((err: unknown) =>
          logger.error({ err, sessionId: s.id }, 'sweep: auto-complete failed'),
        );
      }
    }

    await this.broadcastPositions().catch(() => undefined);
  },

  /** Sessions currently offered to (or waiting for) this agent — F-032 queue view. */
  async pendingFor(agentId: string) {
    return prisma.session.findMany({
      where: { status: 'QUEUED', agentId },
      orderBy: { assignedAt: 'asc' },
    });
  },
};

export type QueueService = typeof queueService;
