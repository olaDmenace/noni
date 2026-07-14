// User self-service — F-004 (preferences), F-005 (PIN), NDPC delete-my-data.
import type { Tier } from '@noni/types';
import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../models/prisma.js';
import { BadRequest, NotFound, Unauthorized } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

function hashPin(pin: string): string {
  return createHmac('sha256', env.OTP_SALT).update(`pin:${pin}`).digest('hex');
}

export const userService = {
  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw NotFound('USER_NOT_FOUND', 'User not found');
    return {
      id: user.id,
      alias: user.alias,
      walletBalanceKobo: user.walletBalanceKobo,
      tierPreference: user.tierPreference,
      hasPin: !!user.pinHash,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt.toISOString(),
    };
  },

  /** F-004: onboarding preference capture. */
  async updatePreferences(userId: string, patch: { tierPreference?: Tier; alias?: string }) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(patch.tierPreference ? { tierPreference: patch.tierPreference } : {}),
        ...(patch.alias ? { alias: patch.alias } : {}),
      },
    });
    return this.me(userId);
  },

  /** F-005: app-lock PIN. Verification happens locally + server-side. */
  async setPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{4,6}$/.test(pin)) throw BadRequest('INVALID_PIN', 'PIN must be 4–6 digits');
    await prisma.user.update({ where: { id: userId }, data: { pinHash: hashPin(pin) } });
  },

  async verifyPin(userId: string, pin: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pinHash) throw BadRequest('NO_PIN', 'No PIN set');
    if (user.pinHash !== hashPin(pin)) throw Unauthorized('PIN_INVALID', 'Wrong PIN');
  },

  async clearPin(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { pinHash: null } });
  },

  /**
   * NDPC right-to-erasure (NF-013/NF-014). Message content was never stored;
   * this removes everything else: the user row cascades to sessions, wallet
   * transactions, tokens, blocks and reports. Crisis incidents are keyed by
   * session id only (no user reference) and remain as anonymous audit rows.
   * If the account is also an agent, the agent profile goes too.
   */
  async deleteAccount(userId: string): Promise<void> {
    const agent = await prisma.agent.findUnique({ where: { userId } });
    if (agent) {
      await prisma.agent.delete({ where: { id: agent.id } });
    }
    await prisma.user.delete({ where: { id: userId } });
    logger.info({ userId }, 'account deleted (NDPC erasure request)');
  },
};
