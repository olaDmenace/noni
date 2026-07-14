import { createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export function hashPhone(phone: string): string {
  // HMAC-SHA256 with a server-side salt — irreversible. See arch §9.2.
  return createHmac('sha256', env.PHONE_HASH_SALT).update(phone.trim()).digest('hex');
}

export function hashOtp(code: string): string {
  return createHmac('sha256', env.OTP_SALT).update(code).digest('hex');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateOtp(): string {
  // 6-digit zero-padded OTP.
  const buf = randomBytes(4);
  const num = buf.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
