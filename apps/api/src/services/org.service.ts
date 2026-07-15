// B2B — organizations (universities, employers) buy bulk access delivered as
// redeemable codes that grant a subscription tier with no wallet charge.
import { customAlphabet } from 'nanoid';
import { prisma } from '../models/prisma.js';
import { SESSIONS_PER_MONTH } from './subscription.service.js';
import { BadRequest, NotFound } from '../utils/errors.js';

const codeAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

function addMonth(d: Date): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export const orgService = {
  async createOrg(name: string, contactNote?: string) {
    return prisma.organization.create({ data: { name, contactNote } });
  },

  async listOrgs() {
    return prisma.organization.findMany({
      include: { codes: { select: { id: true, code: true, tier: true, redemptions: true, maxRedemptions: true, expiresAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createCodes(args: {
    orgId: string;
    tier: 'T6' | 'T7';
    count: number;
    maxRedemptions?: number;
    expiresAt?: Date;
  }) {
    const org = await prisma.organization.findUnique({ where: { id: args.orgId } });
    if (!org?.isActive) throw NotFound('ORG_NOT_FOUND', 'Organization not found');
    const codes = await Promise.all(
      Array.from({ length: args.count }, () =>
        prisma.orgAccessCode.create({
          data: {
            orgId: args.orgId,
            code: `NONI-${codeAlphabet()}`,
            tier: args.tier,
            maxRedemptions: args.maxRedemptions ?? 1,
            expiresAt: args.expiresAt ?? null,
          },
        }),
      ),
    );
    return codes.map((c) => ({ id: c.id, code: c.code, tier: c.tier }));
  },

  /** User redeems a code → subscription granted, no wallet charge. */
  async redeem(userId: string, code: string) {
    // Guarded increment makes redemption race-safe against the cap.
    const claimed = await prisma.orgAccessCode.updateMany({
      where: {
        code: code.trim().toUpperCase(),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        // maxRedemptions is enforced below via the raw comparison
      },
      data: { redemptions: { increment: 1 } },
    });
    if (claimed.count === 0) throw BadRequest('CODE_INVALID', 'Code not found or expired');
    const row = await prisma.orgAccessCode.findUniqueOrThrow({
      where: { code: code.trim().toUpperCase() },
    });
    if (row.redemptions > row.maxRedemptions) {
      await prisma.orgAccessCode.update({
        where: { id: row.id },
        data: { redemptions: { decrement: 1 } },
      });
      throw BadRequest('CODE_EXHAUSTED', 'Code has been fully redeemed');
    }

    const tier = row.tier as 'T6' | 'T7';
    const data = {
      tier,
      sessionsRemaining: SESSIONS_PER_MONTH[tier],
      rolloverSessions: 0,
      renewsAt: addMonth(new Date()),
      isActive: true,
      pausedAt: null,
      cancelledAt: null,
      graceUntil: null,
      providerRef: `org-${row.id}-${row.redemptions}`,
    };
    const existing = await prisma.subscription.findUnique({ where: { userId } });
    const sub = existing
      ? await prisma.subscription.update({ where: { userId }, data })
      : await prisma.subscription.create({ data: { userId, ...data } });
    return {
      tier: sub.tier,
      sessionsRemaining: sub.sessionsRemaining,
      renewsAt: sub.renewsAt.toISOString(),
    };
  },
};
