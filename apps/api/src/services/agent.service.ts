// Agent portal — F-006, F-011, F-031, F-032, F-033, F-034, S-006.
import { AgentStatus, MIN_AGENT_PAYOUT_KOBO } from '@noni/types';
import type { SessionType } from '@noni/types';
import { prisma } from '../models/prisma.js';
import { encryptNote, decryptNote } from '../utils/appEncryption.js';
import { BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import { paymentService } from './payment.service.js';
import { queueService } from './queue.service.js';

export const agentService = {
  /** F-006: public browse list. Only rateable, live-able agents appear. */
  async list(query: {
    sessionType?: SessionType;
    specialty?: string;
    language?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(query.limit ?? 20, 50);
    const agents = await prisma.agent.findMany({
      where: {
        isSuspended: false,
        crisisTrainingPassedAt: { not: null },
        status: { in: ['AVAILABLE', 'BUSY'] },
        ...(query.sessionType ? { sessionTypes: { has: query.sessionType } } : {}),
        ...(query.specialty ? { specialties: { has: query.specialty } } : {}),
        ...(query.language ? { languages: { has: query.language } } : {}),
      },
      orderBy: [{ status: 'asc' }, { ratingAvg: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = agents.length > limit;
    const page = hasMore ? agents.slice(0, limit) : agents;
    return {
      agents: page.map((a) => ({
        id: a.id,
        alias: a.alias,
        specialties: a.specialties,
        sessionTypes: a.sessionTypes,
        languages: a.languages,
        status: a.status,
        ratingAvg: a.ratingAvg,
        ratingCount: a.ratingCount,
        estimatedWaitSecs: a.status === 'AVAILABLE' ? 0 : 15 * 60,
      })),
      cursor: hasMore ? page[page.length - 1]!.id : null,
    };
  },

  async setStatus(agentUserId: string, status: AgentStatus) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    if (agent.isSuspended) throw Forbidden('AGENT_SUSPENDED', 'Account under review');

    // S-006 gate. Cannot transition to AVAILABLE without crisis training.
    if (status === AgentStatus.AVAILABLE && !agent.crisisTrainingPassedAt) {
      throw BadRequest(
        'CRISIS_TRAINING_REQUIRED',
        'Complete crisis training before going online.',
      );
    }

    await prisma.agent.update({ where: { id: agent.id }, data: { status } });
    // A freshly-available agent may unblock the queue.
    if (status === AgentStatus.AVAILABLE) await queueService.matchNext();
  },

  /** F-033: real aggregates, not placeholders. */
  async dashboard(agentUserId: string) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');

    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [completed, today, week, month] = await Promise.all([
      prisma.session.count({ where: { agentId: agent.id, status: 'COMPLETED' } }),
      sumPayout(agent.id, dayStart),
      sumPayout(agent.id, weekStart),
      sumPayout(agent.id, monthStart),
    ]);

    return {
      earningsBalanceKobo: agent.earningsBalanceKobo,
      earningsTodayKobo: today,
      earningsThisWeekKobo: week,
      earningsThisMonthKobo: month,
      sessionsCompleted: completed,
      ratingAvg: agent.ratingAvg,
      ratingCount: agent.ratingCount,
      nextPayoutDate: nextFridayIso(),
      minPayoutKobo: MIN_AGENT_PAYOUT_KOBO,
      crisisTrainingPassedAt: agent.crisisTrainingPassedAt
        ? agent.crisisTrainingPassedAt.toISOString()
        : null,
      trainingPassedAt: agent.trainingPassedAt ? agent.trainingPassedAt.toISOString() : null,
      canGoOnline: !!agent.crisisTrainingPassedAt && !agent.isSuspended,
      hasBankAccount: !!agent.bankAccountEncrypted && !!agent.bankCode,
    };
  },

  /** F-032: sessions currently offered to this agent. */
  async listQueue(agentUserId: string) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    const pending = await queueService.pendingFor(agent.id);
    return pending.map((s) => ({
      id: s.id,
      tier: s.tier,
      sessionType: s.sessionType,
      isPriority: s.isPriority,
      assignedAt: s.assignedAt?.toISOString() ?? null,
    }));
  },

  async accept(agentUserId: string, sessionId: string) {
    return queueService.accept(agentUserId, sessionId);
  },
  async pass(agentUserId: string, sessionId: string) {
    await queueService.pass(agentUserId, sessionId);
  },

  /** F-031: profile self-service. Bank account is encrypted at rest. */
  async updateProfile(
    agentUserId: string,
    patch: {
      specialties?: string[];
      languages?: string[];
      sessionTypes?: SessionType[];
      bankCode?: string;
      bankAccountName?: string;
      bankAccountNumber?: string;
    },
  ) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        ...(patch.specialties ? { specialties: patch.specialties } : {}),
        ...(patch.languages ? { languages: patch.languages } : {}),
        ...(patch.sessionTypes ? { sessionTypes: patch.sessionTypes } : {}),
        ...(patch.bankCode ? { bankCode: patch.bankCode } : {}),
        ...(patch.bankAccountName ? { bankAccountName: patch.bankAccountName } : {}),
        ...(patch.bankAccountNumber
          ? { bankAccountEncrypted: encryptNote(patch.bankAccountNumber) }
          : {}),
      },
    });
    return {
      specialties: updated.specialties,
      languages: updated.languages,
      sessionTypes: updated.sessionTypes,
      bankCode: updated.bankCode,
      bankAccountName: updated.bankAccountName,
      bankAccountLast4: updated.bankAccountEncrypted
        ? decryptNote(updated.bankAccountEncrypted).slice(-4)
        : null,
    };
  },

  /** F-034: payout via Flutterwave Transfers. Min ₦2,000. */
  async requestPayout(agentUserId: string) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    if (agent.earningsBalanceKobo < MIN_AGENT_PAYOUT_KOBO) {
      throw BadRequest('BELOW_MINIMUM', `Minimum payout is ₦${MIN_AGENT_PAYOUT_KOBO / 100}`);
    }
    if (!agent.bankCode || !agent.bankAccountEncrypted) {
      throw BadRequest('NO_BANK_ACCOUNT', 'Add your bank details first');
    }

    const amountKobo = agent.earningsBalanceKobo;
    // Zero the balance up-front (guarded) so double-taps can't double-pay.
    const zeroed = await prisma.agent.updateMany({
      where: { id: agent.id, earningsBalanceKobo: amountKobo },
      data: { earningsBalanceKobo: 0 },
    });
    if (zeroed.count === 0) throw BadRequest('RETRY', 'Balance changed, try again');

    const payout = await prisma.agentPayout.create({
      data: { agentId: agent.id, amountKobo, status: 'PENDING' },
    });
    try {
      await paymentService.transferToBank({
        payoutId: payout.id,
        amountKobo,
        bankCode: agent.bankCode,
        accountNumber: decryptNote(agent.bankAccountEncrypted),
        narration: `Noni payout ${payout.id.slice(0, 8)}`,
      });
    } catch (err) {
      // Transfer failed — restore the balance so the agent can retry.
      await prisma.agent.update({
        where: { id: agent.id },
        data: { earningsBalanceKobo: { increment: amountKobo } },
      });
      throw err;
    }
    return { payoutId: payout.id, amountKobo };
  },

  async listPayouts(agentUserId: string) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    const payouts = await prisma.agentPayout.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return payouts.map((p) => ({
      id: p.id,
      amountKobo: p.amountKobo,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      settledAt: p.settledAt?.toISOString() ?? null,
    }));
  },
};

async function sumPayout(agentId: string, since: Date): Promise<number> {
  const agg = await prisma.session.aggregate({
    where: { agentId, status: 'COMPLETED', endedAt: { gte: since } },
    _sum: { agentPayoutKobo: true },
  });
  return agg._sum.agentPayoutKobo ?? 0;
}

function nextFridayIso(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const delta = (5 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
