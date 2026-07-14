// Pricing tiers — see PRD §7.1.
export const Tier = {
  T0: 'T0', // Free AI chat
  T1: 'T1', // Text basic ₦100
  T2: 'T2', // Text priority ₦150
  T3: 'T3', // Voice 30-min ₦300
  T4: 'T4', // Voice 60-min ₦500
  T5: 'T5', // Premium counselor ₦800
  T6: 'T6', // Monthly Lite ₦500/mo
  T7: 'T7', // Monthly Standard ₦2,000/mo
} as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

export const SessionType = {
  TEXT: 'TEXT',
  VOICE: 'VOICE',
} as const;
export type SessionType = (typeof SessionType)[keyof typeof SessionType];

export const SessionStatus = {
  QUEUED: 'QUEUED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  INTERRUPTED: 'INTERRUPTED',
  CRISIS_FLAGGED: 'CRISIS_FLAGGED',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const AgentStatus = {
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const TransactionType = {
  TOPUP: 'TOPUP',
  SESSION_DEBIT: 'SESSION_DEBIT',
  REFUND: 'REFUND',
  SUBSCRIPTION: 'SUBSCRIPTION',
  PAYOUT: 'PAYOUT',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const UserRole = {
  USER: 'USER',
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
