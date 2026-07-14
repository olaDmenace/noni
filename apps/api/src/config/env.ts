import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  OTP_SALT: z.string().min(8),
  PHONE_HASH_SALT: z.string().min(8),

  // Flutterwave is the payment provider. Empty secret key = dev mode (simulated
  // checkout via POST /v1/payments/dev/complete, disabled in production).
  FLW_SECRET_KEY: z.string().optional().default(''),
  FLW_WEBHOOK_HASH: z.string().optional().default(''),
  FLW_REDIRECT_URL: z.string().url().default('https://noni.ng/payment/complete'),

  // Legacy Paystack keys — kept optional so old .env files still boot.
  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional().default(''),

  // 64 hex chars (32 bytes) for AES-256-GCM agent-note encryption (F-017).
  NOTE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .default('a'.repeat(64)),

  // On-call supervisor for S-003 crisis alerts (SMS via the active SMS provider).
  SUPERVISOR_PHONE: z.string().optional().default(''),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  // SMS routing: auto = smsgate if configured, else termii if configured, else dev (log only).
  SMS_PROVIDER: z.enum(['auto', 'termii', 'smsgate', 'dev']).default('auto'),

  TERMII_API_KEY: z.string().optional().default(''),
  TERMII_SENDER_ID: z.string().default('Noni'),

  SMSGATE_BASE_URL: z.string().url().default('https://api.sms-gate.app/3rdparty/v1'),
  SMSGATE_USERNAME: z.string().optional().default(''),
  SMSGATE_PASSWORD: z.string().optional().default(''),

  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
  SENTRY_DSN: z.string().optional().default(''),
  POSTHOG_API_KEY: z.string().optional().default(''),

  TURN_SERVER_URL: z.string().default('turn:localhost:3478'),
  TURN_SHARED_SECRET: z.string().default('dev-only'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Env = typeof env;
