// Payments — Flutterwave (F-024, F-025, F-028, F-029). Arch §8, provider swapped
// from Paystack per product decision (2026-07). Supports card, bank transfer,
// USSD and mobile-money wallets (OPay, PalmPay) via Flutterwave payment options.
//
// Dev mode: with FLW_SECRET_KEY empty, initiateTopup returns a fake checkout link
// and POST /v1/payments/dev/complete simulates the webhook (non-production only).
//
// Anonymity: Flutterwave requires a customer email; users are phone-hash
// anonymous, so we send a synthetic per-user address that routes nowhere.
import { nanoid } from 'nanoid';
import { env } from '../config/env.js';
import { prisma } from '../models/prisma.js';
import { publishToRoom, rooms } from '../realtime/publish.js';
import { BadRequest, NotFound, Unauthorized } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';

const FLW_BASE = 'https://api.flutterwave.com/v3';

export function isDevPayments(): boolean {
  return !env.FLW_SECRET_KEY;
}

async function flw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FLW_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as
    | { status?: string; message?: string; data?: T }
    | null;
  if (!res.ok || body?.status !== 'success') {
    logger.error({ path, status: res.status, body }, 'flutterwave request failed');
    throw BadRequest('PAYMENT_PROVIDER_ERROR', body?.message ?? 'Payment provider error');
  }
  return body.data as T;
}

export const paymentService = {
  async initiateTopup(userId: string, amountKobo: number, paymentOption?: 'opay') {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw NotFound('USER_NOT_FOUND', 'User not found');

    const reference = `noni-topup-${nanoid(16)}`;
    // Record the pending intent; verification (or the webhook, if ever
    // configured) credits against this row.
    await prisma.walletTransaction.create({
      data: {
        userId,
        type: 'TOPUP',
        amountKobo: 0, // set to the real amount when payment is confirmed
        providerRef: reference,
        metadata: { expectedKobo: amountKobo, status: 'PENDING', paymentOption: paymentOption ?? 'any' },
      },
    });

    if (isDevPayments()) {
      return {
        authorizationUrl: `https://dev.noni.local/pay/${reference}`,
        reference,
      };
    }

    const data = await flw<{ link: string }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: reference,
        amount: (amountKobo / 100).toFixed(2), // Flutterwave takes naira
        currency: 'NGN',
        redirect_url: env.FLW_REDIRECT_URL,
        // 'opay' alone sends the checkout straight to OPay (NGN-only method).
        payment_options: paymentOption === 'opay' ? 'opay' : 'card,banktransfer,ussd,opay,account',
        customer: { email: `${userId}@anon.noni.ng`, name: user.alias },
        customizations: { title: 'Noni wallet top-up' },
      }),
    });
    return { authorizationUrl: data.link, reference };
  },

  /**
   * Webhook-independent confirmation: verify a pending top-up by our own
   * tx_ref via GET /v3/transactions/verify_by_reference. This is the primary
   * confirmation path — the Flutterwave account's dashboard webhook belongs to
   * another product, so Noni never depends on it. Crediting is idempotent, so
   * verify + webhook can never double-credit.
   */
  async verifyTopup(reference: string, requesterId?: string) {
    const txn = await prisma.walletTransaction.findUnique({ where: { providerRef: reference } });
    if (!txn || txn.type !== 'TOPUP') throw NotFound('REFERENCE_NOT_FOUND', 'Unknown reference');
    if (requesterId && txn.userId !== requesterId) {
      throw NotFound('REFERENCE_NOT_FOUND', 'Unknown reference');
    }
    const meta = (txn.metadata ?? {}) as { status?: string; expectedKobo?: number };
    if (meta.status === 'COMPLETED') {
      return { credited: true, status: 'successful' };
    }

    if (isDevPayments()) {
      // Dev mode has no provider to ask — verification behaves like the
      // simulated checkout completing.
      await this.creditTopup(reference, meta.expectedKobo ?? 0);
      return { credited: true, status: 'successful' };
    }

    const data = await flw<{ status: string; amount: number; currency: string; tx_ref: string }>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    );
    const paidKobo = Math.round(data.amount * 100);
    const okay =
      data.status === 'successful' &&
      data.currency === 'NGN' &&
      data.tx_ref === reference &&
      paidKobo >= (meta.expectedKobo ?? Number.MAX_SAFE_INTEGER);
    if (!okay) {
      logger.info({ reference, status: data.status, paidKobo }, 'top-up not (yet) payable');
      return { credited: false, status: data.status };
    }
    await this.creditTopup(reference, paidKobo);
    return { credited: true, status: 'successful' };
  },

  /**
   * Background safety net for users who paid but never returned to the app:
   * verify pending top-ups between 2 minutes and 24 hours old. Called from the
   * sweeper; no-op in dev mode.
   */
  async pollPendingTopups(): Promise<void> {
    if (isDevPayments()) return;
    const now = Date.now();
    const pending = await prisma.walletTransaction.findMany({
      where: {
        type: 'TOPUP',
        amountKobo: 0,
        createdAt: { lt: new Date(now - 2 * 60 * 1000), gt: new Date(now - 24 * 60 * 60 * 1000) },
        providerRef: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    for (const txn of pending) {
      const meta = (txn.metadata ?? {}) as { status?: string };
      if (meta.status === 'COMPLETED') continue;
      await this.verifyTopup(txn.providerRef!).catch((err: unknown) =>
        logger.debug({ err, reference: txn.providerRef }, 'pending top-up poll failed'),
      );
    }
  },

  /**
   * Flutterwave webhook. Verification: the `verif-hash` header must equal the
   * secret hash configured in the dashboard (Flutterwave's scheme — a shared
   * secret, not an HMAC of the body).
   */
  async handleWebhook(rawBody: Buffer | string, signatureHeader: string): Promise<void> {
    if (!env.FLW_WEBHOOK_HASH || signatureHeader !== env.FLW_WEBHOOK_HASH) {
      throw Unauthorized('BAD_WEBHOOK_SIGNATURE', 'verif-hash mismatch');
    }
    const payload = JSON.parse(rawBody.toString()) as {
      event?: string;
      data?: { id?: number; tx_ref?: string; status?: string; amount?: number; currency?: string };
    };
    if (payload.event !== 'charge.completed' || payload.data?.status !== 'successful') return;

    const { tx_ref, amount, currency, id } = payload.data;
    if (!tx_ref || !amount || currency !== 'NGN') return;

    // Re-verify with Flutterwave before crediting (their recommended practice).
    if (!isDevPayments() && id) {
      const verified = await flw<{ status: string; amount: number; currency: string }>(
        `/transactions/${id}/verify`,
      );
      if (verified.status !== 'successful' || verified.currency !== 'NGN') return;
    }

    await this.creditTopup(tx_ref, Math.round(amount * 100));
  },

  /** Idempotent credit — a replayed webhook cannot double-credit. */
  async creditTopup(reference: string, amountKobo: number): Promise<void> {
    const txn = await prisma.walletTransaction.findUnique({ where: { providerRef: reference } });
    if (!txn) {
      logger.warn({ reference }, 'webhook for unknown top-up reference');
      return;
    }
    const meta = (txn.metadata ?? {}) as { status?: string; expectedKobo?: number };
    if (meta.status === 'COMPLETED') return; // replay — already credited

    await prisma.$transaction([
      prisma.walletTransaction.update({
        where: { id: txn.id },
        data: { amountKobo, metadata: { ...meta, status: 'COMPLETED' } },
      }),
      prisma.user.update({
        where: { id: txn.userId },
        data: { walletBalanceKobo: { increment: amountKobo } },
      }),
    ]);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: txn.userId } });
    await publishToRoom(rooms.user(txn.userId), 'wallet_update', {
      balanceKobo: user.walletBalanceKobo,
    });
    await notificationService.push(txn.userId, {
      title: 'Wallet topped up',
      body: `₦${(amountKobo / 100).toLocaleString()} added to your wallet.`,
      data: { type: 'TOPUP' },
    });
  },

  /** Dev-mode only: simulate a successful checkout for a pending reference. */
  async devComplete(reference: string): Promise<void> {
    if (env.NODE_ENV === 'production') throw NotFound();
    const txn = await prisma.walletTransaction.findUnique({ where: { providerRef: reference } });
    if (!txn) throw NotFound('REFERENCE_NOT_FOUND', 'Unknown reference');
    const meta = (txn.metadata ?? {}) as { expectedKobo?: number };
    await this.creditTopup(reference, meta.expectedKobo ?? 0);
  },

  async getWallet(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw NotFound('USER_NOT_FOUND', 'User not found');
    const recentTransactions = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      balanceKobo: user.walletBalanceKobo,
      recentTransactions: recentTransactions.map(serializeTxn),
    };
  },

  /** F-028: full payment history, cursor-paginated. */
  async history(userId: string, cursor?: string, limit = 50) {
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = transactions.length > limit;
    const page = hasMore ? transactions.slice(0, limit) : transactions;
    return {
      transactions: page.map(serializeTxn),
      cursor: hasMore ? page[page.length - 1]!.id : null,
    };
  },

  /** F-028: payment history as a PDF (downloadable on request). */
  async exportHistoryPdf(userId: string): Promise<Buffer> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw NotFound('USER_NOT_FOUND', 'User not found');
    const txns = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    doc.fontSize(18).text('Noni — Payment History');
    doc.fontSize(10).fillColor('#666')
      .text(`Account alias: ${user.alias}`)
      .text(`Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`)
      .moveDown();

    doc.fillColor('#000').fontSize(10);
    const naira = (kobo: number) => `${kobo < 0 ? '-' : ''}NGN ${(Math.abs(kobo) / 100).toLocaleString('en-NG')}`;
    for (const t of txns) {
      doc.text(
        `${t.createdAt.toISOString().slice(0, 10)}  ${t.type.padEnd(14)} ${naira(t.amountKobo).padStart(16)}  ${t.providerRef ?? ''}`,
      );
    }
    if (txns.length === 0) doc.text('No transactions.');
    doc.moveDown().fontSize(8).fillColor('#666')
      .text('All amounts in Nigerian Naira. Session content is never stored — this report contains payments only.');
    doc.end();
    return finished;
  },

  /**
   * F-034: weekly agent payout via Flutterwave Transfers. Dev mode marks the
   * payout SUCCESS immediately so the flow is testable end-to-end.
   */
  async transferToBank(args: {
    payoutId: string;
    amountKobo: number;
    bankCode: string;
    accountNumber: string;
    narration: string;
  }): Promise<void> {
    if (isDevPayments()) {
      await prisma.agentPayout.update({
        where: { id: args.payoutId },
        data: { status: 'SUCCESS', settledAt: new Date(), providerRef: `dev-${nanoid(10)}` },
      });
      return;
    }
    try {
      const data = await flw<{ id: number; reference: string }>('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          account_bank: args.bankCode,
          account_number: args.accountNumber,
          amount: Math.round(args.amountKobo / 100),
          currency: 'NGN',
          narration: args.narration,
          reference: `noni-payout-${args.payoutId}`,
        }),
      });
      await prisma.agentPayout.update({
        where: { id: args.payoutId },
        data: { status: 'SUCCESS', settledAt: new Date(), providerRef: String(data.id) },
      });
    } catch (err) {
      await prisma.agentPayout.update({
        where: { id: args.payoutId },
        data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : 'unknown' },
      });
      throw err;
    }
  },
};

type DbTxn = {
  id: string;
  userId: string;
  type: string;
  amountKobo: number;
  providerRef: string | null;
  sessionId: string | null;
  createdAt: Date;
};

function serializeTxn(t: DbTxn) {
  return {
    id: t.id,
    userId: t.userId,
    type: t.type,
    amountKobo: t.amountKobo,
    providerRef: t.providerRef,
    sessionId: t.sessionId,
    createdAt: t.createdAt.toISOString(),
  };
}
