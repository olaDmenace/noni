import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { orgService } from '../services/org.service.js';
import { subscriptionService } from '../services/subscription.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const subscriptionRouter = Router();

subscriptionRouter.get(
  '/me',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json({ subscription: await subscriptionService.getMine(req.user!.sub) });
  }),
);

subscriptionRouter.post(
  '/',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { tier } = z.object({ tier: z.enum(['T6', 'T7']) }).parse(req.body);
    res.status(201).json(await subscriptionService.create(req.user!.sub, tier));
  }),
);

// B2B: redeem an organization access code for a sponsored plan.
subscriptionRouter.post(
  '/redeem',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(6).max(20) }).parse(req.body);
    res.json(await orgService.redeem(req.user!.sub, code));
  }),
);

subscriptionRouter.post(
  '/pause',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json(await subscriptionService.pause(req.user!.sub));
  }),
);

subscriptionRouter.post(
  '/resume',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json(await subscriptionService.resume(req.user!.sub));
  }),
);

subscriptionRouter.post(
  '/cancel',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json(await subscriptionService.cancel(req.user!.sub));
  }),
);
