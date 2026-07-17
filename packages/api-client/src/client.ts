// Lightweight typed API client for the Noni REST API.
// Used by both mobile apps. Endpoints map to arch §11.2.

import type {
  AgentApplicationState,
  AgentApplyBody,
  AgentDashboardResponse,
  AgentListQuery,
  AgentListResponse,
  AgentPayout,
  AgentProfileResponse,
  AgentQueueItem,
  Booking,
  CreateBookingBody,
  AiMessageBody,
  AiMessageResponse,
  ApiError,
  AuthTokens,
  CompleteCrisisTrainingBody,
  CompleteCrisisTrainingResponse,
  CreateSessionBody,
  CreateSessionResponse,
  CreateSubscriptionBody,
  InitiateTopupBody,
  InitiateTopupResponse,
  MeResponse,
  PaymentHistoryResponse,
  PracticeMessageResponse,
  RateSessionBody,
  RedeemCodeResponse,
  RegisterPushTokenBody,
  ReportAgentBody,
  RequestOtpBody,
  Session,
  SubscriptionState,
  UpdateAgentProfileBody,
  UpdateAgentStatusBody,
  UpdateMeBody,
  UpgradeRequestResponse,
  UpgradeRespondResponse,
  VerifyOtpBody,
  VerifyTopupResponse,
  WalletStateResponse,
  WsTurnCredentialsEvent,
} from '@noni/types';

export interface ClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  getRefreshToken?: () => string | null | Promise<string | null>;
  onTokensRefreshed?: (tokens: AuthTokens) => void | Promise<void>;
  onUnauthorized?: () => void | Promise<void>;
}

export class NoniApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(payload: ApiError) {
    super(payload.error);
    this.code = payload.code;
    this.statusCode = payload.statusCode;
  }
}

export class NoniApiClient {
  private refreshing: Promise<AuthTokens> | null = null;
  constructor(private readonly opts: ClientOptions) {}

  private async tryRefresh(): Promise<AuthTokens | null> {
    if (!this.opts.getRefreshToken) return null;
    const token = await this.opts.getRefreshToken();
    if (!token) return null;
    if (!this.refreshing) {
      this.refreshing = this.refresh(token).finally(() => {
        this.refreshing = null;
      });
    }
    try {
      const tokens = await this.refreshing;
      await this.opts.onTokensRefreshed?.(tokens);
      return tokens;
    } catch {
      return null;
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  requestOtp(body: RequestOtpBody) {
    return this.post<void>('/v1/auth/request-otp', body, { auth: false });
  }
  verifyOtp(body: VerifyOtpBody) {
    return this.post<AuthTokens>('/v1/auth/verify-otp', body, { auth: false });
  }
  refresh(refreshToken: string) {
    return this.post<AuthTokens>('/v1/auth/refresh', { refreshToken }, { auth: false });
  }

  // ── Agents (user-side) ────────────────────────────────────────────────
  listAgents(query: AgentListQuery = {}) {
    return this.get<AgentListResponse>('/v1/agents', query);
  }

  // ── Sessions ──────────────────────────────────────────────────────────
  createSession(body: CreateSessionBody) {
    return this.post<CreateSessionResponse>('/v1/sessions', body);
  }
  getSession(id: string) {
    return this.get<Session>(`/v1/sessions/${id}`);
  }
  endSession(id: string) {
    return this.post<Session>(`/v1/sessions/${id}/end`, {});
  }
  rateSession(id: string, body: RateSessionBody) {
    return this.post<void>(`/v1/sessions/${id}/rate`, body);
  }
  flagCrisis(id: string) {
    return this.post<void>(`/v1/sessions/${id}/crisis-flag`, {});
  }
  blockAgent(id: string) {
    return this.post<void>(`/v1/sessions/${id}/block`, {});
  }
  reportAgent(id: string, body: ReportAgentBody) {
    return this.post<{ reportId: string }>(`/v1/sessions/${id}/report`, body);
  }

  // ── AI ────────────────────────────────────────────────────────────────
  startAiSession() {
    return this.get<{ sessionId: string }>('/v1/ai/session');
  }
  sendAiMessage(body: AiMessageBody) {
    return this.post<AiMessageResponse>('/v1/ai/message', body);
  }

  // ── Payments ──────────────────────────────────────────────────────────
  getWallet() {
    return this.get<WalletStateResponse>('/v1/payments/wallet');
  }
  initiateTopup(body: InitiateTopupBody) {
    return this.post<InitiateTopupResponse>('/v1/payments/initiate', body);
  }
  paymentHistory(cursor?: string) {
    return this.get<PaymentHistoryResponse>('/v1/payments/history', cursor ? { cursor } : {});
  }
  /** Confirm a top-up by reference (webhook-independent). Safe to call repeatedly. */
  verifyTopup(reference: string) {
    return this.post<VerifyTopupResponse>('/v1/payments/verify', { reference });
  }
  /** Dev-mode only — simulates a successful Flutterwave checkout. */
  devCompleteTopup(reference: string) {
    return this.post<void>('/v1/payments/dev/complete', { reference });
  }

  // ── Subscriptions (F-026) ─────────────────────────────────────────────
  getSubscription() {
    return this.get<{ subscription: SubscriptionState | null }>('/v1/subscriptions/me');
  }
  createSubscription(body: CreateSubscriptionBody) {
    return this.post<SubscriptionState>('/v1/subscriptions', body);
  }
  pauseSubscription() {
    return this.post<SubscriptionState>('/v1/subscriptions/pause', {});
  }
  resumeSubscription() {
    return this.post<SubscriptionState>('/v1/subscriptions/resume', {});
  }
  cancelSubscription() {
    return this.post<SubscriptionState>('/v1/subscriptions/cancel', {});
  }

  // ── Users ─────────────────────────────────────────────────────────────
  me() {
    return this.get<MeResponse>('/v1/users/me');
  }
  updateMe(body: UpdateMeBody) {
    return this.patch<MeResponse>('/v1/users/me', body);
  }
  setPin(pin: string) {
    return this.post<void>('/v1/users/me/pin', { pin });
  }
  verifyPin(pin: string) {
    return this.post<void>('/v1/users/me/pin/verify', { pin });
  }
  registerPushToken(body: RegisterPushTokenBody) {
    return this.post<void>('/v1/users/me/push-token', body);
  }
  deleteAccount() {
    return this.request<void>(new URL('/v1/users/me', this.opts.baseUrl).toString(), {
      method: 'DELETE',
    });
  }

  // ── Advance scheduling (F-010) ────────────────────────────────────────
  createBooking(body: CreateBookingBody) {
    return this.post<Booking>('/v1/schedule', body);
  }
  myBookings() {
    return this.get<{ bookings: Booking[] }>('/v1/schedule/me');
  }
  cancelBooking(id: string) {
    return this.request<void>(new URL(`/v1/schedule/${id}`, this.opts.baseUrl).toString(), {
      method: 'DELETE',
    });
  }
  agentSchedule() {
    return this.get<{ bookings: Booking[] }>('/v1/agents/me/schedule');
  }

  // ── Voice upgrade (F-014) ─────────────────────────────────────────────
  requestVoiceUpgrade(sessionId: string) {
    return this.post<UpgradeRequestResponse>(`/v1/sessions/${sessionId}/upgrade-request`, {});
  }
  acceptVoiceUpgrade(sessionId: string) {
    return this.post<UpgradeRespondResponse>(`/v1/sessions/${sessionId}/upgrade-accept`, {});
  }
  declineVoiceUpgrade(sessionId: string) {
    return this.post<UpgradeRespondResponse>(`/v1/sessions/${sessionId}/upgrade-decline`, {});
  }

  // ── Agent applications + practice bot (F-030) ─────────────────────────
  applyAsAgent(body: AgentApplyBody) {
    return this.post<AgentApplicationState>('/v1/agents/apply', body);
  }
  myAgentApplication() {
    return this.get<{ application: AgentApplicationState | null }>('/v1/agents/apply/me');
  }
  practiceMessage(message: string) {
    return this.post<PracticeMessageResponse>('/v1/agents/me/practice/message', { message });
  }
  resetPractice() {
    return this.request<void>(
      new URL('/v1/agents/me/practice', this.opts.baseUrl).toString(),
      { method: 'DELETE' },
    );
  }

  // ── B2B org codes ─────────────────────────────────────────────────────
  redeemAccessCode(code: string) {
    return this.post<RedeemCodeResponse>('/v1/subscriptions/redeem', { code });
  }

  // ── PDF export (F-028) ────────────────────────────────────────────────
  /** Returns the export URL; fetch with the bearer token to download. */
  paymentHistoryExportUrl() {
    return new URL('/v1/payments/history/export', this.opts.baseUrl).toString();
  }

  // ── Voice (F-013) ─────────────────────────────────────────────────────
  getTurnCredentials(sessionId: string) {
    return this.get<WsTurnCredentialsEvent>(`/v1/sessions/${sessionId}/turn-credentials`);
  }

  // ── Session notes (F-017, agent only) ─────────────────────────────────
  putSessionNote(sessionId: string, note: string) {
    return this.request<void>(
      new URL(`/v1/sessions/${sessionId}/note`, this.opts.baseUrl).toString(),
      { method: 'PUT', body: JSON.stringify({ note }) },
    );
  }
  getSessionNote(sessionId: string) {
    return this.get<{ note: string | null }>(`/v1/sessions/${sessionId}/note`);
  }

  // ── Agent portal ──────────────────────────────────────────────────────
  agentDashboard() {
    return this.get<AgentDashboardResponse>('/v1/agents/me/dashboard');
  }
  setAgentStatus(body: UpdateAgentStatusBody) {
    return this.patch<void>('/v1/agents/me/status', body);
  }
  agentQueue() {
    return this.get<{ requests: AgentQueueItem[] }>('/v1/agents/me/queue');
  }
  acceptSession(sessionId: string) {
    return this.post<Session>(`/v1/agents/me/queue/${sessionId}/accept`, {});
  }
  passSession(sessionId: string) {
    return this.post<void>(`/v1/agents/me/queue/${sessionId}/pass`, {});
  }
  updateAgentProfile(body: UpdateAgentProfileBody) {
    return this.patch<AgentProfileResponse>('/v1/agents/me/profile', body);
  }
  requestPayout() {
    return this.post<{ payoutId: string; amountKobo: number }>(
      '/v1/agents/me/payout/request',
      {},
    );
  }
  listPayouts() {
    return this.get<{ payouts: AgentPayout[] }>('/v1/agents/me/payouts');
  }
  getCrisisQuiz() {
    return this.get<{
      questions: Array<{
        id: string;
        prompt: string;
        options: Array<{ id: string; label: string }>;
      }>;
    }>('/v1/agents/me/training/crisis');
  }
  completeCrisisTraining(body: CompleteCrisisTrainingBody) {
    return this.post<CompleteCrisisTrainingResponse>(
      '/v1/agents/me/training/crisis/complete',
      body,
    );
  }

  // ── Internal ──────────────────────────────────────────────────────────
  private get<T>(path: string, query?: object) {
    const url = new URL(path, this.opts.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return this.request<T>(url.toString(), { method: 'GET' });
  }
  private post<T>(path: string, body: unknown, opts: { auth?: boolean } = {}) {
    return this.request<T>(new URL(path, this.opts.baseUrl).toString(), {
      method: 'POST',
      body: JSON.stringify(body),
      auth: opts.auth ?? true,
    });
  }
  private patch<T>(path: string, body: unknown) {
    return this.request<T>(new URL(path, this.opts.baseUrl).toString(), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  private async request<T>(
    url: string,
    init: RequestInit & { auth?: boolean; _retried?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) ?? {}),
    };
    if (init.auth !== false && this.opts.getAccessToken) {
      const token = await this.opts.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...init, headers });

    if (res.status === 401 && init.auth !== false && !init._retried) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(url, { ...init, _retried: true });
      }
      await this.opts.onUnauthorized?.();
    }

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as ApiError | null;
      throw new NoniApiError(
        payload ?? {
          error: res.statusText,
          code: 'UNKNOWN',
          statusCode: res.status,
        },
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
