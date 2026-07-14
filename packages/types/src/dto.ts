// API DTOs — request/response shapes shared by API + mobile clients.
// Endpoints map to arch §11.2.
import type { Tier, SessionType, SessionStatus, AgentStatus } from './enums.js';
import type { Agent, Session, User, WalletTransaction } from './models.js';

// ── Auth ────────────────────────────────────────────────────────────────
export interface RequestOtpBody {
  phone: string;
}
export interface VerifyOtpBody {
  phone: string;
  code: string;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// ── Agents ──────────────────────────────────────────────────────────────
export interface AgentListQuery {
  sessionType?: SessionType;
  specialty?: string;
  language?: string;
  cursor?: string;
  limit?: number;
}
export interface AgentListResponse {
  agents: (Agent & { estimatedWaitSecs: number })[];
  cursor: string | null;
}

// ── Sessions ────────────────────────────────────────────────────────────
export interface CreateSessionBody {
  tier: Tier;
  sessionType: SessionType;
  isPriority?: boolean;
  preferredAgentId?: string;
}
export interface CreateSessionResponse {
  session: Session;
  queuePosition: number;
  estimatedWaitSecs: number;
}
export interface RateSessionBody {
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
}

// ── AI ──────────────────────────────────────────────────────────────────
export interface AiMessageBody {
  sessionId: string;
  message: string;
}
export interface AiMessageResponse {
  reply: string;
  showUpgradeNudge: boolean;
  crisisDetected: boolean;
}

// ── Payments ────────────────────────────────────────────────────────────
export interface InitiateTopupBody {
  amountKobo: number;
  /** 'opay' sends the Flutterwave checkout straight to OPay (NGN only). */
  paymentOption?: 'opay';
}
export interface InitiateTopupResponse {
  authorizationUrl: string;
  reference: string;
}
export interface VerifyTopupResponse {
  credited: boolean;
  status: string;
}
export interface WalletStateResponse {
  balanceKobo: number;
  recentTransactions: WalletTransaction[];
}

// ── Subscriptions ───────────────────────────────────────────────────────
export interface CreateSubscriptionBody {
  tier: Extract<Tier, 'T6' | 'T7'>;
}
export interface SubscriptionState {
  id: string;
  userId: string;
  tier: Tier;
  sessionsRemaining: number;
  rolloverSessions: number;
  renewsAt: string;
  isActive: boolean;
  isPaused: boolean;
}

// ── Users ───────────────────────────────────────────────────────────────
export interface MeResponse {
  id: string;
  alias: string;
  walletBalanceKobo: number;
  tierPreference: Tier | null;
  hasPin: boolean;
  createdAt: string;
  lastActiveAt: string;
}
export interface UpdateMeBody {
  tierPreference?: Tier;
  alias?: string;
}
export interface RegisterPushTokenBody {
  token: string;
  platform: 'IOS' | 'ANDROID';
}

// ── Payment history (F-028) ─────────────────────────────────────────────
export interface PaymentHistoryResponse {
  transactions: WalletTransaction[];
  cursor: string | null;
}

// ── Agent portal extras ─────────────────────────────────────────────────
export interface AgentQueueItem {
  id: string;
  tier: Tier;
  sessionType: SessionType;
  isPriority: boolean;
  assignedAt: string | null;
}
export interface UpdateAgentProfileBody {
  specialties?: string[];
  languages?: string[];
  sessionTypes?: SessionType[];
  bankCode?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}
export interface AgentProfileResponse {
  specialties: string[];
  languages: string[];
  sessionTypes: SessionType[];
  bankCode: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
}

// ── Agent portal ────────────────────────────────────────────────────────
export interface AgentDashboardResponse {
  earningsBalanceKobo: number;
  earningsTodayKobo: number;
  earningsThisWeekKobo: number;
  earningsThisMonthKobo: number;
  sessionsCompleted: number;
  ratingAvg: number;
  ratingCount: number;
  nextPayoutDate: string;
  minPayoutKobo: number;
  crisisTrainingPassedAt: string | null;
  trainingPassedAt: string | null;
  canGoOnline: boolean;
  hasBankAccount: boolean;
}
export interface UpdateAgentStatusBody {
  status: AgentStatus;
}
export interface CompleteCrisisTrainingBody {
  // Client sends the quiz answers. Server re-verifies.
  // See safetyService.CRISIS_QUIZ for the question bank.
  answers: Array<{ questionId: string; choice: string }>;
}
export interface CompleteCrisisTrainingResponse {
  passed: boolean;
  score: number;
  passingScore: number;
  crisisTrainingPassedAt: string | null;
  feedback: Array<{ questionId: string; correct: boolean; rationale: string }>;
}

// ── Errors ──────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  code: string;
  statusCode: number;
}

// ── WebSocket events — arch §11.3 ───────────────────────────────────────
export interface WsMessageEvent {
  text: string;
  sender: 'USER' | 'AGENT' | 'AI';
  timestamp: number;
}
export interface WsQueueUpdateEvent {
  position: number;
  estimatedWaitSecs: number;
}
export interface WsCrisisAlertEvent {
  message: string;
  hotlineNumber: string;
}
export interface WsSessionEndEvent {
  reason: 'COMPLETED' | 'INTERRUPTED' | 'CRISIS_FLAGGED';
  durationSecs: number;
}
export interface WsAgentJoinedEvent {
  agentAlias: string;
  sessionType: SessionType;
}
export interface WsSessionAssignedEvent {
  sessionId: string;
  tier: Tier;
  sessionType: SessionType;
  isPriority: boolean;
  acceptWindowSecs: number;
}
export interface WsTypingEvent {
  sender: 'USER' | 'AGENT';
}
export interface WsWalletUpdateEvent {
  balanceKobo: number;
}
export interface WsWebrtcSignalEvent {
  sessionId: string;
  data: unknown;
}
export interface WsTurnCredentialsEvent {
  urls: string[];
  username: string;
  credential: string;
  ttlSecs: number;
}

export type SessionStatusType = SessionStatus; // re-export for convenience
