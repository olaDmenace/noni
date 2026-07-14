// SMS provider abstraction.
// - termii:  production route (requires a registered business with Termii).
// - smsgate: SMS Gate (sms-gate.app) — sends through an Android phone's SIM via the
//            cloud API. Dev/beta route while the business isn't registered yet.
// - dev:     no provider configured; the message is logged to the API console.
// SMS_PROVIDER=auto picks smsgate > termii > dev based on which credentials exist.
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type SmsProvider = 'termii' | 'smsgate' | 'dev';

export interface SmsProviderConfig {
  smsProvider: string;
  smsgateUsername: string;
  smsgatePassword: string;
  termiiApiKey: string;
}

export function resolveSmsProvider(cfg: SmsProviderConfig): SmsProvider {
  if (cfg.smsProvider !== 'auto') return cfg.smsProvider as SmsProvider;
  if (cfg.smsgateUsername && cfg.smsgatePassword) return 'smsgate';
  if (cfg.termiiApiKey) return 'termii';
  return 'dev';
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}…`;
}

async function sendViaTermii(phone: string, text: string): Promise<void> {
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: phone,
      from: env.TERMII_SENDER_ID,
      sms: text,
      type: 'plain',
      channel: 'generic',
      api_key: env.TERMII_API_KEY,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'Termii send failed');
    throw new Error('SMS provider error');
  }
}

async function sendViaSmsGate(phone: string, text: string): Promise<void> {
  const auth = Buffer.from(`${env.SMSGATE_USERNAME}:${env.SMSGATE_PASSWORD}`).toString('base64');
  const res = await fetch(`${env.SMSGATE_BASE_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      textMessage: { text },
      phoneNumbers: [phone],
      // OTPs are useless after expiry — drop the message instead of delivering late.
      ttl: 300,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, body }, 'SMS Gate send failed');
    throw new Error('SMS provider error');
  }
}

export const smsService = {
  provider(): SmsProvider {
    return resolveSmsProvider({
      smsProvider: env.SMS_PROVIDER,
      smsgateUsername: env.SMSGATE_USERNAME,
      smsgatePassword: env.SMSGATE_PASSWORD,
      termiiApiKey: env.TERMII_API_KEY,
    });
  },

  async send(phone: string, text: string): Promise<void> {
    switch (this.provider()) {
      case 'smsgate':
        return sendViaSmsGate(phone, text);
      case 'termii':
        return sendViaTermii(phone, text);
      case 'dev':
        // Text is in the message string (not a field) so pino redact rules don't mask codes.
        logger.info(`SMS (dev) to ${maskPhone(phone)}: ${text}`);
    }
  },
};
