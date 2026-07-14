import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { aiService } from '../services/ai.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const aiRouter = Router();

aiRouter.get(
  '/session',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (_req, res) => {
    // T0 sessions are ephemeral — only an id is needed for keying Redis history.
    res.json({ sessionId: `ai_${nanoid(16)}` });
  }),
);

aiRouter.post(
  '/message',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { sessionId, message } = z
      .object({ sessionId: z.string().min(1), message: z.string().min(1).max(2000) })
      .parse(req.body);
    const result = await aiService.chat(sessionId, message);
    res.json(result);
  }),
);
