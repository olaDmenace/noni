import { Tier } from './enums.js';

// All amounts in kobo (₦1 = 100 kobo). See PRD §7.1.
export interface TierPricing {
  priceKobo: number;
  agentCostKobo: number;
  platformNetKobo: number;
  durationSecs: number | null;
  isSubscription: boolean;
}

export const TIER_PRICING: Record<Tier, TierPricing> = {
  T0: { priceKobo: 0,      agentCostKobo: 0,     platformNetKobo: 0,     durationSecs: null,  isSubscription: false },
  // T1 repriced ₦50→₦100 (2026-07); agent cut raised ₦20→₦35 for listener retention.
  T1: { priceKobo: 10_000, agentCostKobo: 3_500, platformNetKobo: 6_500, durationSecs: 1200,  isSubscription: false },
  // T2 agent cut aligned with T1's 2026-07 raise (same 20-min session; priority fee is platform's).
  T2: { priceKobo: 15_000, agentCostKobo: 3_500, platformNetKobo: 11_500, durationSecs: 1200, isSubscription: false },
  T3: { priceKobo: 30_000, agentCostKobo: 10_000, platformNetKobo: 20_000, durationSecs: 1800, isSubscription: false },
  T4: { priceKobo: 50_000, agentCostKobo: 17_500, platformNetKobo: 32_500, durationSecs: 3600, isSubscription: false },
  T5: { priceKobo: 80_000, agentCostKobo: 35_000, platformNetKobo: 45_000, durationSecs: 2700, isSubscription: false },
  T6: { priceKobo: 50_000, agentCostKobo: 0,     platformNetKobo: 40_000, durationSecs: null,  isSubscription: true  },
  T7: { priceKobo: 200_000, agentCostKobo: 0,    platformNetKobo: 170_000, durationSecs: null, isSubscription: true },
};

export const PRIORITY_QUEUE_FEE_KOBO = 10_000; // T2 priority surcharge ₦100
// ₦500 minimum top-up (2026-07): amortizes Flutterwave processing fees over multiple
// sessions. Session prices are unchanged — the wallet decouples payment size from price.
export const MIN_WALLET_TOPUP_KOBO = 50_000;
export const MIN_AGENT_PAYOUT_KOBO = 200_000;  // ₦2,000 minimum payout
