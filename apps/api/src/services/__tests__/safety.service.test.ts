import { describe, expect, it } from 'vitest';
import { safetyService } from '../safety.service.js';

describe('safetyService.hasCrisisKeyword', () => {
  it('detects direct suicidal ideation', () => {
    const result = safetyService.hasCrisisKeyword('I want to kill myself tonight');
    expect(result.detected).toBe(true);
    expect(result.matchedKeyword).toBe('kill myself');
  });

  it('detects Pidgin phrasing', () => {
    const result = safetyService.hasCrisisKeyword('I don tire, life don tire me');
    expect(result.detected).toBe(true);
  });

  it('does not flag benign distress', () => {
    const result = safetyService.hasCrisisKeyword('I am stressed about my exam tomorrow');
    expect(result.detected).toBe(false);
  });

  it('is case-insensitive', () => {
    const result = safetyService.hasCrisisKeyword('SUICIDE is on my mind');
    expect(result.detected).toBe(true);
  });

  it('always returns the canonical hotline number', () => {
    const r = safetyService.hasCrisisKeyword('end my life');
    expect(r.hotline).toBe('08111909090');
  });
});
