// Mirror of Prisma model shapes — see arch §5.1.
// Kept hand-written so the mobile apps can import without depending on Prisma.
import type {
  AgentStatus,
  SessionStatus,
  SessionType,
  Tier,
  TransactionType,
} from './enums.js';

export interface User {
  id: string;
  alias: string;
  walletBalanceKobo: number;
  tierPreference: Tier | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface Agent {
  id: string;
  alias: string;
  specialties: string[];
  sessionTypes: SessionType[];
  languages: string[];
  status: AgentStatus;
  ratingAvg: number;
  ratingCount: number;
}

export interface Session {
  id: string;
  userId: string;
  agentId: string | null;
  tier: Tier;
  sessionType: SessionType;
  status: SessionStatus;
  isPriority: boolean;
  amountChargedKobo: number;
  agentPayoutKobo: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSecs: number | null;
  userRating: number | null;
  crisisFlag: boolean;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amountKobo: number;
  providerRef: string | null;
  sessionId: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  tier: Tier;
  sessionsRemaining: number;
  rolloverSessions: number;
  renewsAt: string;
  isActive: boolean;
  isPaused: boolean;
}

export interface AgentPayout {
  id: string;
  amountKobo: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
  settledAt: string | null;
}
