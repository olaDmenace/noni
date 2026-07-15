// Subscriptions — F-026. T6 ₦500/mo = 5 sessions (T1/T3 mix); T7 ₦2,000/mo = 15
// sessions + priority queue access. Unused sessions roll over one month only.
// Renewal is wallet-funded (auto-debit); a failed debit opens a 3-day grace
// window, after which the subscription deactivates.
import type { Tier } from '@noni/types';
import { TIER_PRICING } from '@noni/types';
import { prisma } from '../models/prisma.js';
import { BadRequest, Conflict, NotFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';

export const SESSIONS_PER_MONTH: Record<'T6' | 'T7', number> = { T6: 5, T7: 15 };
const GRACE_DAYS = 3;

function addMonth(d: Date): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export const subscriptionService = {
  async create(userId: string, tier: 'T6' | 'T7') {
    const pricing = TIER_PRICING[tier];
    const existing = await prisma.subscription.findUnique({ where: { userId } });
    if (existing?.isActive) throw Conflict('ALREADY_SUBSCRIBED', 'Cancel your current plan first');

    const debited = await prisma.user.updateMany({
      where: { id: userId, walletBalanceKobo: { gte: pricing.priceKobo } },
      data: { walletBalanceKobo: { decrement: pricing.priceKobo } },
    });
    if (debited.count === 0) {
      throw BadRequest('INSUFFICIENT_FUNDS', 'Top up your wallet to subscribe');
    }
    await prisma.walletTransaction.create({
      data: { userId, type: 'SUBSCRIPTION', amountKobo: -pricing.priceKobo },
    });

    const data = {
      tier,
      sessionsRemaining: SESSIONS_PER_MONTH[tier],
      rolloverSessions: 0,
      renewsAt: addMonth(new Date()),
      isActive: true,
      pausedAt: null,
      cancelledAt: null,
      graceUntil: null,
    };
    const sub = existing
      ? await prisma.subscription.update({ where: { userId }, data })
      : await prisma.subscription.create({ data: { userId, ...data } });
    return serialize(sub);
  },

  async getMine(userId: string) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    return sub ? serialize(sub) : null;
  },

  async pause(userId: string) {
    const sub = await requireActive(userId);
    return serialize(
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { pausedAt: new Date() },
      }),
    );
  },

  async resume(userId: string) {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub?.isActive || !sub.pausedAt) throw BadRequest('NOT_PAUSED', 'Plan is not paused');
    return serialize(
      await prisma.subscription.update({ where: { id: sub.id }, data: { pausedAt: null } }),
    );
  },

  async cancel(userId: string) {
    const sub = await requireActive(userId);
    return serialize(
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { isActive: false, cancelledAt: new Date() },
      }),
    );
  },

  /** True (and decrements) if an active, unpaused plan covers this session. */
  async tryConsumeSession(userId: string): Promise<boolean> {
    // Consume rollover sessions first — they expire at the next renewal.
    // Guard clauses in the WHERE make each decrement race-safe.
    const fromRollover = await prisma.subscription.updateMany({
      where: { userId, isActive: true, pausedAt: null, rolloverSessions: { gt: 0 } },
      data: { rolloverSessions: { decrement: 1 } },
    });
    if (fromRollover.count > 0) return true;
    const fromCurrent = await prisma.subscription.updateMany({
      where: { userId, isActive: true, pausedAt: null, sessionsRemaining: { gt: 0 } },
      data: { sessionsRemaining: { decrement: 1 } },
    });
    return fromCurrent.count > 0;
  },

  /** Give a consumed session back (interrupted session on a subscription). */
  async restoreSession(userId: string): Promise<void> {
    await prisma.subscription.updateMany({
      where: { userId, isActive: true },
      data: { sessionsRemaining: { increment: 1 } },
    });
  },

  /** T7 subscribers get priority queue access (F-026 / PRD §7.1). */
  async hasPriorityAccess(userId: string): Promise<boolean> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    return !!sub && sub.isActive && !sub.pausedAt && sub.tier === 'T7';
  },

  /**
   * Renewal sweep — run periodically. Debits the wallet on the renewal date;
   * on failure opens a grace window, then deactivates (PRD §7.2).
   */
  async sweepRenewals(): Promise<void> {
    const due = await prisma.subscription.findMany({
      where: { isActive: true, pausedAt: null, renewsAt: { lte: new Date() } },
    });
    for (const sub of due) {
      // B2B org-code subscriptions expire at month end instead of auto-debiting.
      if (sub.providerRef?.startsWith('org-')) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { isActive: false, cancelledAt: new Date() },
        });
        await notificationService.push(sub.userId, {
          title: 'Organization plan ended',
          body: 'Your sponsored month is over. Redeem a new code or subscribe to continue.',
          data: { type: 'ORG_SUBSCRIPTION_ENDED' },
        });
        continue;
      }
      const pricing = TIER_PRICING[sub.tier as Tier];
      const debited = await prisma.user.updateMany({
        where: { id: sub.userId, walletBalanceKobo: { gte: pricing.priceKobo } },
        data: { walletBalanceKobo: { decrement: pricing.priceKobo } },
      });
      if (debited.count > 0) {
        await prisma.walletTransaction.create({
          data: { userId: sub.userId, type: 'SUBSCRIPTION', amountKobo: -pricing.priceKobo },
        });
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            // F-026: unused sessions roll over exactly one month.
            rolloverSessions: sub.sessionsRemaining,
            sessionsRemaining: SESSIONS_PER_MONTH[sub.tier as 'T6' | 'T7'],
            renewsAt: addMonth(sub.renewsAt),
            graceUntil: null,
          },
        });
        await notificationService.push(sub.userId, {
          title: 'Plan renewed',
          body: 'Your Noni plan has renewed for another month.',
          data: { type: 'SUBSCRIPTION_RENEWED' },
        });
      } else if (!sub.graceUntil) {
        const graceUntil = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
        await prisma.subscription.update({ where: { id: sub.id }, data: { graceUntil } });
        await notificationService.push(sub.userId, {
          title: 'Renewal failed',
          body: `Top up your wallet within ${GRACE_DAYS} days to keep your plan.`,
          data: { type: 'SUBSCRIPTION_GRACE' },
        });
      } else if (sub.graceUntil.getTime() < Date.now()) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { isActive: false, cancelledAt: new Date() },
        });
        logger.info({ userId: sub.userId }, 'subscription lapsed after grace period');
      }
    }
  },
};

async function requireActive(userId: string) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.isActive) throw NotFound('NO_SUBSCRIPTION', 'No active plan');
  return sub;
}

type DbSub = {
  id: string;
  userId: string;
  tier: string;
  sessionsRemaining: number;
  rolloverSessions: number;
  renewsAt: Date;
  isActive: boolean;
  pausedAt: Date | null;
  cancelledAt: Date | null;
};

function serialize(s: DbSub) {
  return {
    id: s.id,
    userId: s.userId,
    tier: s.tier,
    sessionsRemaining: s.sessionsRemaining,
    rolloverSessions: s.rolloverSessions,
    renewsAt: s.renewsAt.toISOString(),
    isActive: s.isActive,
    isPaused: !!s.pausedAt,
  };
}
