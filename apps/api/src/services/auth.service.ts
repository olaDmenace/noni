import jwt from 'jsonwebtoken';
import type { AuthTokens } from '@noni/types';
import { env } from '../config/env.js';
import type { JwtPayload } from '../middleware/auth.js';
import { prisma } from '../models/prisma.js';
import {
  generateOpaqueToken,
  generateOtp,
  hashOtp,
  hashPhone,
  sha256,
} from '../utils/crypto.js';
import { BadRequest, TooManyRequests, Unauthorized } from '../utils/errors.js';
import { smsService } from './sms.service.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ALIAS_WORDS = [
  'River', 'Quiet', 'Aurora', 'Harbor', 'Linden', 'Solace', 'Meadow', 'Ember',
  'Lantern', 'Willow', 'Cove', 'Drift', 'Mirror', 'Plume', 'Cedar', 'Tide',
];

function generateAlias(): string {
  const word = ALIAS_WORDS[Math.floor(Math.random() * ALIAS_WORDS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}${num}`;
}

async function issueTokens(userId: string, role: JwtPayload['role']): Promise<AuthTokens> {
  const accessToken = jwt.sign({ sub: userId, role } satisfies JwtPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  });
  const refreshToken = generateOpaqueToken(32);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      alias: user.alias,
      walletBalanceKobo: user.walletBalanceKobo,
      tierPreference: user.tierPreference,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt.toISOString(),
    },
  };
}

export const authService = {
  async requestOtp(phone: string): Promise<void> {
    const phoneHash = hashPhone(phone);
    const recent = await prisma.otpRequest.findFirst({
      where: { phoneHash, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw TooManyRequests('Wait before requesting a new code');
    }
    const code = generateOtp();
    await prisma.otpRequest.create({
      data: {
        phoneHash,
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await smsService.send(phone, `Your Noni code is ${code}. It expires in 5 minutes.`);
  },

  async verifyOtp(phone: string, code: string): Promise<AuthTokens> {
    const phoneHash = hashPhone(phone);
    const otp = await prisma.otpRequest.findFirst({
      where: { phoneHash, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw Unauthorized('OTP_NOT_FOUND', 'Request a new code');
    if (otp.expiresAt.getTime() < Date.now()) {
      throw Unauthorized('OTP_EXPIRED', 'Code expired, request a new one');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw TooManyRequests('Too many attempts, request a new code');
    }
    if (otp.codeHash !== hashOtp(code)) {
      await prisma.otpRequest.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw Unauthorized('OTP_INVALID', 'Wrong code');
    }
    await prisma.otpRequest.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const user = await prisma.user.upsert({
      where: { phoneHash },
      update: { lastActiveAt: new Date() },
      create: { phoneHash, alias: generateAlias() },
    });
    return issueTokens(user.id, user.role);
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) throw BadRequest('NO_REFRESH', 'Missing refresh token');
    const tokenHash = sha256(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw Unauthorized('REFRESH_INVALID', 'Sign in again');
    }
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return issueTokens(stored.user.id, stored.user.role);
  },
};
