import { Router, raw, json } from 'express';
import { z } from 'zod';
import { MIN_WALLET_TOPUP_KOBO } from '@noni/types';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { paymentService, isDevPayments } from '../services/payment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFound } from '../utils/errors.js';

export const paymentRouter = Router();

// This router mounts BEFORE the global express.json() (see app.ts) because the
// webhook needs the raw body. Non-webhook routes parse JSON locally instead.
const parseJson = json({ limit: '64kb' });

paymentRouter.get(
  '/wallet',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json(await paymentService.getWallet(req.user!.sub));
  }),
);

paymentRouter.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { cursor, limit } = z
      .object({ cursor: z.string().optional(), limit: z.coerce.number().int().max(100).optional() })
      .parse(req.query);
    res.json(await paymentService.history(req.user!.sub, cursor, limit));
  }),
);

// F-028: downloadable PDF of the full payment history.
paymentRouter.get(
  '/history/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pdf = await paymentService.exportHistoryPdf(req.user!.sub);
    res
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', 'attachment; filename="noni-payment-history.pdf"')
      .send(pdf);
  }),
);

paymentRouter.post(
  '/initiate',
  parseJson,
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { amountKobo, paymentOption } = z
      .object({
        amountKobo: z.number().int().min(MIN_WALLET_TOPUP_KOBO),
        paymentOption: z.enum(['opay']).optional(),
      })
      .parse(req.body);
    res.json(await paymentService.initiateTopup(req.user!.sub, amountKobo, paymentOption));
  }),
);

// Webhook-independent confirmation (verify_by_reference). The app calls this
// when the user returns from checkout; the sweeper also polls pending top-ups.
paymentRouter.post(
  '/verify',
  parseJson,
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { reference } = z.object({ reference: z.string().min(8) }).parse(req.body);
    res.json(await paymentService.verifyTopup(reference, req.user!.sub));
  }),
);

// Flutterwave webhook — verified via the `verif-hash` header (shared secret).
paymentRouter.post(
  '/webhook',
  raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.header('verif-hash') ?? '';
    await paymentService.handleWebhook(req.body as Buffer, signature);
    res.status(200).json({ received: true });
  }),
);

// Dev-mode checkout simulator. 404s in production or with real keys configured.
paymentRouter.post(
  '/dev/complete',
  parseJson,
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isDevPayments()) throw NotFound();
    const { reference } = z.object({ reference: z.string() }).parse(req.body);
    await paymentService.devComplete(reference);
    res.status(204).end();
  }),
);
