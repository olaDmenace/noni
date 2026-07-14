// Session lifecycle — F-006 to F-017, F-027, F-029, F-035, S-005.
import type { Tier, SessionType } from '@noni/types';
import { PRIORITY_QUEUE_FEE_KOBO, TIER_PRICING } from '@noni/types';
import { prisma } from '../models/prisma.js';
import { publishToRoom, rooms } from '../realtime/publish.js';
import { encryptNote, decryptNote } from '../utils/appEncryption.js';
import { BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';
import { queueService } from './queue.service.js';
import { safetyService } from './safety.service.js';
import { subscriptionService } from './subscription.service.js';

const REPORT_REASONS = ['MISCONDUCT', 'INAPPROPRIATE', 'UNSAFE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const RATING_FLAG_THRESHOLD = 3.5; // F-035
const RATING_FLAG_MIN_COUNT = 20;

export const sessionService = {
  async create(args: {
    userId: string;
    tier: Tier;
    sessionType: SessionType;
    isPriority?: boolean;
    preferredAgentId?: string;
  }) {
    const pricing = TIER_PRICING[args.tier];
    if (!pricing || args.tier === 'T0') {
      throw BadRequest('INVALID_TIER', 'Use /v1/ai for the free tier');
    }
    if (pricing.isSubscription) {
      throw BadRequest('SUBSCRIPTION_TIER', 'Subscribe via /v1/subscriptions, then book T1/T3');
    }

    // T2 is priority-by-definition; other tiers may buy the surcharge (F-027).
    const isPriority = args.tier === 'T2' || !!args.isPriority;

    // Subscription cover (F-026): T6/T7 bundles pay for T1/T3 sessions.
    const coveredBySub =
      ['T1', 'T3'].includes(args.tier) &&
      (await subscriptionService.tryConsumeSession(args.userId));

    let amountChargedKobo = 0;
    if (!coveredBySub) {
      amountChargedKobo =
        pricing.priceKobo + (isPriority && args.tier !== 'T2' ? PRIORITY_QUEUE_FEE_KOBO : 0);
      // Atomic wallet debit — guard clause in the WHERE prevents overdraft races.
      const debited = await prisma.user.updateMany({
        where: { id: args.userId, walletBalanceKobo: { gte: amountChargedKobo } },
        data: { walletBalanceKobo: { decrement: amountChargedKobo } },
      });
      if (debited.count === 0) {
        throw BadRequest('INSUFFICIENT_FUNDS', 'Top up your wallet to book this session');
      }
    }

    const session = await prisma.session.create({
      data: {
        userId: args.userId,
        tier: args.tier,
        sessionType: args.sessionType,
        isPriority,
        amountChargedKobo,
        agentPayoutKobo: pricing.agentCostKobo,
        paidFromSubscription: coveredBySub,
      },
    });
    if (amountChargedKobo > 0) {
      await prisma.walletTransaction.create({
        data: {
          userId: args.userId,
          type: 'SESSION_DEBIT',
          amountKobo: -amountChargedKobo,
          sessionId: session.id,
        },
      });
    }

    const queue = await queueService.enqueue(session.id, { priority: isPriority });
    return {
      session: serialize(session),
      queuePosition: queue.position,
      estimatedWaitSecs: queue.estimatedWaitSecs,
    };
  },

  async getById(sessionId: string, requesterId: string, role: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: { select: { alias: true, userId: true } } },
    });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    const isOwner = session.userId === requesterId;
    const isAgent = session.agent?.userId === requesterId;
    if (!isOwner && !isAgent && role !== 'ADMIN') throw Forbidden();
    return { ...serialize(session), agentAlias: session.agent?.alias ?? null };
  },

  async isParticipant(sessionId: string, requesterId: string, role: string): Promise<boolean> {
    if (role === 'ADMIN') return true;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: { select: { userId: true } } },
    });
    if (!session) return false;
    return session.userId === requesterId || session.agent?.userId === requesterId;
  },

  /** Normal end by either party. Agent earns their cut; user may rate afterwards. */
  async end(sessionId: string, requesterId: string, role: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: true },
    });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    const isOwner = session.userId === requesterId;
    const isAgent = session.agent?.userId === requesterId;
    if (!isOwner && !isAgent && role !== 'ADMIN') throw Forbidden();

    if (session.status === 'QUEUED') {
      // User cancelled before an agent connected — full refund, nobody earns.
      await this.interruptWithRefund(sessionId, 'USER_CANCELLED');
      return this.getById(sessionId, requesterId, role);
    }
    if (session.status !== 'ACTIVE') {
      throw BadRequest('NOT_ACTIVE', 'Session is not active');
    }

    const endedAt = new Date();
    const durationSecs = session.startedAt
      ? Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000)
      : 0;

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', endedAt, durationSecs },
      }),
      ...(session.agentId
        ? [
            prisma.agent.update({
              where: { id: session.agentId },
              data: {
                status: 'AVAILABLE',
                earningsBalanceKobo: { increment: session.agentPayoutKobo },
              },
            }),
          ]
        : []),
    ]);

    await publishToRoom(rooms.session(sessionId), 'session_end', {
      reason: 'COMPLETED',
      durationSecs,
    });
    await queueService.matchNext(); // freed agent may take the next queued session
    return this.getById(sessionId, requesterId, role);
  },

  /** F-029: interrupted session → full credit back, agent gets zero. */
  async interruptWithRefund(sessionId: string, reason: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || ['COMPLETED', 'INTERRUPTED'].includes(session.status)) return;

    const ops = [];
    ops.push(
      prisma.session.update({
        where: { id: sessionId },
        data: { status: 'INTERRUPTED', endedAt: new Date(), agentPayoutKobo: 0 },
      }),
    );
    if (session.amountChargedKobo > 0) {
      ops.push(
        prisma.user.update({
          where: { id: session.userId },
          data: { walletBalanceKobo: { increment: session.amountChargedKobo } },
        }),
        prisma.walletTransaction.create({
          data: {
            userId: session.userId,
            type: 'REFUND',
            amountKobo: session.amountChargedKobo,
            sessionId,
            metadata: { reason },
          },
        }),
      );
    }
    if (session.agentId) {
      ops.push(
        prisma.agent.update({ where: { id: session.agentId }, data: { status: 'AVAILABLE' } }),
      );
    }
    await prisma.$transaction(ops);

    if (session.paidFromSubscription) {
      await subscriptionService.restoreSession(session.userId);
    }
    await queueService.remove(sessionId);
    await publishToRoom(rooms.session(sessionId), 'session_end', {
      reason: 'INTERRUPTED',
      durationSecs: 0,
    });
    await publishToRoom(rooms.queue(sessionId), 'session_end', {
      reason: 'INTERRUPTED',
      durationSecs: 0,
    });
    await notificationService.push(session.userId, {
      title: 'Session interrupted',
      body: 'Your wallet has been fully refunded.',
      data: { sessionId, type: 'REFUND' },
    });
    await queueService.matchNext();
  },

  /** F-029: agent socket dropped — interrupt every ACTIVE session they carry. */
  async handleAgentDisconnect(agentUserId: string): Promise<void> {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) return;
    const active = await prisma.session.findMany({
      where: { agentId: agent.id, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const s of active) {
      await this.interruptWithRefund(s.id, 'AGENT_DISCONNECT').catch((err: unknown) =>
        logger.error({ err, sessionId: s.id }, 'agent-disconnect refund failed'),
      );
    }
    if (active.length) {
      await prisma.agent.update({ where: { id: agent.id }, data: { status: 'OFFLINE' } });
    }
  },

  /** F-035: rate a completed session; keep the agent's aggregate honest. */
  async rate(sessionId: string, userId: string, rating: number, comment?: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    if (session.userId !== userId) throw Forbidden('NOT_SESSION_USER', 'Not your session');
    if (session.status !== 'COMPLETED') throw BadRequest('NOT_COMPLETED', 'Rate after the session ends');
    if (session.userRating !== null) throw BadRequest('ALREADY_RATED', 'Session already rated');
    if (!session.agentId) throw BadRequest('NO_AGENT', 'Nothing to rate on this session');

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: session.agentId } });
    const newCount = agent.ratingCount + 1;
    const newAvg = (agent.ratingAvg * agent.ratingCount + rating) / newCount;
    const flagged =
      newCount >= RATING_FLAG_MIN_COUNT && newAvg < RATING_FLAG_THRESHOLD && !agent.flaggedForReview;

    await prisma.$transaction([
      prisma.session.update({
        where: { id: sessionId },
        data: { userRating: rating, userRatingComment: comment ?? null },
      }),
      prisma.agent.update({
        where: { id: agent.id },
        data: { ratingAvg: newAvg, ratingCount: newCount, ...(flagged ? { flaggedForReview: true } : {}) },
      }),
    ]);

    if (flagged) {
      await publishToRoom(rooms.admins(), 'agent_flagged', {
        agentId: agent.id,
        ratingAvg: newAvg,
        ratingCount: newCount,
      });
      logger.warn({ agentId: agent.id, newAvg, newCount }, 'agent flagged for review (F-035)');
    }
  },

  async flagCrisis(sessionId: string) {
    await safetyService.triggerCrisisProtocol({
      sessionId,
      triggeredBy: 'AGENT_FLAG',
      triggerSource: 'AGENT',
    });
  },

  async blockAgent(userId: string, sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    if (session.userId !== userId) throw BadRequest('NOT_SESSION_USER', 'Not your session');
    if (!session.agentId) throw BadRequest('NO_AGENT', 'No agent to block on this session');

    await prisma.agentBlock.upsert({
      where: { userId_agentId: { userId, agentId: session.agentId } },
      create: { userId, agentId: session.agentId, sessionId },
      update: {},
    });
    // S-005: session ends, no charge — the refund path handles both.
    await this.interruptWithRefund(sessionId, 'USER_BLOCKED_AGENT');
  },

  async reportAgent(args: {
    userId: string;
    sessionId: string;
    reason: ReportReason;
    details?: string;
  }) {
    const session = await prisma.session.findUnique({ where: { id: args.sessionId } });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    if (session.userId !== args.userId) throw BadRequest('NOT_SESSION_USER', 'Not your session');
    if (!session.agentId) throw BadRequest('NO_AGENT', 'No agent to report on this session');

    const report = await prisma.agentReport.create({
      data: {
        userId: args.userId,
        agentId: session.agentId,
        sessionId: args.sessionId,
        reason: args.reason,
        details: args.details,
      },
    });

    // S-005: admin review within 24h — alert every admin channel we have.
    await publishToRoom(rooms.admins(), 'report_filed', {
      reportId: report.id,
      agentId: session.agentId,
      reason: args.reason,
    });
    await notificationService.pushToAdmins({
      title: 'Agent reported',
      body: `Reason: ${args.reason}. Review within 24h.`,
      data: { reportId: report.id, type: 'AGENT_REPORT' },
    });
    return { reportId: report.id };
  },

  // F-017: private, encrypted agent notes. Only the session's agent can read/write.
  async putNote(sessionId: string, agentUserId: string, note: string): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: { select: { userId: true } } },
    });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    if (session.agent?.userId !== agentUserId) throw Forbidden('NOT_SESSION_AGENT', 'Not your session');
    const noteEncrypted = encryptNote(note);
    await prisma.agentSessionNote.upsert({
      where: { sessionId },
      create: { sessionId, noteEncrypted },
      update: { noteEncrypted },
    });
  },

  async getNote(sessionId: string, agentUserId: string): Promise<{ note: string | null }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: { select: { userId: true } }, agentNote: true },
    });
    if (!session) throw NotFound('SESSION_NOT_FOUND', 'Session not found');
    if (session.agent?.userId !== agentUserId) throw Forbidden('NOT_SESSION_AGENT', 'Not your session');
    return { note: session.agentNote ? decryptNote(session.agentNote.noteEncrypted) : null };
  },
};

type DbSession = {
  id: string;
  userId: string;
  agentId: string | null;
  tier: string;
  sessionType: string;
  status: string;
  isPriority: boolean;
  amountChargedKobo: number;
  agentPayoutKobo: number;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSecs: number | null;
  userRating: number | null;
  crisisFlag: boolean;
};

function serialize(s: DbSession) {
  return {
    id: s.id,
    userId: s.userId,
    agentId: s.agentId,
    tier: s.tier,
    sessionType: s.sessionType,
    status: s.status,
    isPriority: s.isPriority,
    amountChargedKobo: s.amountChargedKobo,
    agentPayoutKobo: s.agentPayoutKobo,
    startedAt: s.startedAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    durationSecs: s.durationSecs,
    userRating: s.userRating,
    crisisFlag: s.crisisFlag,
  };
}
