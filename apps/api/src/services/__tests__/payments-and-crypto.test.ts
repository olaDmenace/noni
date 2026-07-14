import { describe, expect, it } from 'vitest';
import { encryptNote, decryptNote } from '../../utils/appEncryption.js';
import { generateTurnCredentials } from '../../utils/turn.js';
import { paymentService } from '../payment.service.js';

describe('appEncryption (F-017)', () => {
  it('round-trips text', () => {
    const secret = 'Client mentioned exam stress; follow up on sleep. ₦ symbols ok — naïve test.';
    expect(decryptNote(encryptNote(secret))).toBe(secret);
  });

  it('produces a different ciphertext each call (fresh IV)', () => {
    expect(encryptNote('same')).not.toBe(encryptNote('same'));
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptNote('sensitive');
    const [iv, tag, data] = enc.split(':');
    const flipped = Buffer.from(data!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptNote(`${iv}:${tag}:${flipped.toString('base64')}`)).toThrow();
  });
});

describe('TURN credentials (F-013)', () => {
  it('issues coturn REST-style time-limited credentials', () => {
    const creds = generateTurnCredentials('session-123');
    const [expiry, label] = creds.username.split(':');
    expect(label).toBe('session-123');
    expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000);
    expect(creds.credential.length).toBeGreaterThan(20);
    expect(creds.urls.length).toBeGreaterThan(0);
  });
});

describe('Flutterwave webhook verification', () => {
  it('rejects when no webhook hash is configured', async () => {
    // Test env has FLW_WEBHOOK_HASH unset — any signature must be refused.
    await expect(
      paymentService.handleWebhook(Buffer.from('{}'), 'any-signature'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a wrong verif-hash', async () => {
    await expect(paymentService.handleWebhook(Buffer.from('{}'), '')).rejects.toMatchObject({
      code: 'BAD_WEBHOOK_SIGNATURE',
    });
  });
});
