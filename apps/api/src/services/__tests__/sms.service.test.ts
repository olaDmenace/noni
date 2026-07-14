import { describe, expect, it } from 'vitest';
import { resolveSmsProvider } from '../sms.service.js';

const base = { smsProvider: 'auto', smsgateUsername: '', smsgatePassword: '', termiiApiKey: '' };

describe('resolveSmsProvider', () => {
  it('falls back to dev when nothing is configured', () => {
    expect(resolveSmsProvider(base)).toBe('dev');
  });

  it('prefers smsgate over termii when both are configured', () => {
    expect(
      resolveSmsProvider({
        ...base,
        smsgateUsername: 'u',
        smsgatePassword: 'p',
        termiiApiKey: 'k',
      }),
    ).toBe('smsgate');
  });

  it('uses termii when only termii is configured', () => {
    expect(resolveSmsProvider({ ...base, termiiApiKey: 'k' })).toBe('termii');
  });

  it('ignores smsgate with incomplete credentials', () => {
    expect(resolveSmsProvider({ ...base, smsgateUsername: 'u' })).toBe('dev');
  });

  it('honours an explicit provider over auto-detection', () => {
    expect(resolveSmsProvider({ ...base, smsProvider: 'dev', termiiApiKey: 'k' })).toBe('dev');
  });
});
