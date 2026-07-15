import { Router } from 'express';
import { z } from 'zod';
import { SessionType } from '@noni/types';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { schedulingService } from '../services/scheduling.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const scheduleRouter = Router();

scheduleRouter.post(
  '/',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        agentId: z.string().uuid(),
        tier: z.enum(['T1', 'T3']),
        sessionType: z.nativeEnum(SessionType),
        scheduledAt: z.string().datetime(),
      })
      .parse(req.body);
    res.status(201).json(
      await schedulingService.create({
        userId: req.user!.sub,
        agentId: body.agentId,
        tier: body.tier,
        sessionType: body.sessionType,
        scheduledAt: new Date(body.scheduledAt),
      }),
    );
  }),
);

scheduleRouter.get(
  '/me',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json({ bookings: await schedulingService.listMine(req.user!.sub) });
  }),
);

scheduleRouter.delete(
  '/:id',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    await schedulingService.cancel(req.params.id, req.user!.sub);
    res.status(204).end();
  }),
);
