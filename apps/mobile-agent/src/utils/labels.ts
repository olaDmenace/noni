import { SessionType, Tier } from '@noni/types';

export const TIER_LABEL: Record<Tier, string> = {
  T0: 'Free AI',
  T1: 'Text basic',
  T2: 'Text priority',
  T3: 'Voice 30m',
  T4: 'Voice 60m',
  T5: 'Premium',
  T6: 'Sub · Lite',
  T7: 'Sub · Standard',
};

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  TEXT: 'Text',
  VOICE: 'Voice',
};
