import { Router } from 'express';
import { z } from 'zod';
import { Tier, SessionType } from '@noni/types';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sessionService } from '../services/session.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Forbidden } from '../utils/errors.js';
import { generateTurnCredentials } from '../utils/turn.js';

export const sessionRouter = Router();

const createSchema = z.object({
  tier: z.nativeEnum(Tier),
  sessionType: z.nativeEnum(SessionType),
  isPriority: z.boolean().optional(),
  preferredAgentId: z.string().uuid().optional(),
});

sessionRouter.post(
  '/',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const result = await sessionService.create({ userId: req.user!.sub, ...body });
    res.status(201).json(result);
  }),
);

sessionRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await sessionService.getById(req.params.id, req.user!.sub, req.user!.role));
  }),
);

sessionRouter.post(
  '/:id/end',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await sessionService.end(req.params.id, req.user!.sub, req.user!.role));
  }),
);

// F-013: time-limited TURN credentials for voice sessions.
sessionRouter.get(
  '/:id/turn-credentials',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = await sessionService.isParticipant(
      req.params.id,
      req.user!.sub,
      req.user!.role,
    );
    if (!allowed) throw Forbidden();
    res.json(generateTurnCredentials(req.params.id));
  }),
);

// F-014: text → voice upgrade.
sessionRouter.post(
  '/:id/upgrade-request',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    res.json(await sessionService.requestVoiceUpgrade(req.params.id, req.user!.sub));
  }),
);

sessionRouter.post(
  '/:id/upgrade-accept',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json(await sessionService.respondVoiceUpgrade(req.params.id, req.user!.sub, true));
  }),
);

sessionRouter.post(
  '/:id/upgrade-decline',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json(await sessionService.respondVoiceUpgrade(req.params.id, req.user!.sub, false));
  }),
);

// F-017: private encrypted agent notes.
sessionRouter.put(
  '/:id/note',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().max(4000) }).parse(req.body);
    await sessionService.putNote(req.params.id, req.user!.sub, note);
    res.status(204).end();
  }),
);

sessionRouter.get(
  '/:id/note',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json(await sessionService.getNote(req.params.id, req.user!.sub));
  }),
);

sessionRouter.post(
  '/:id/rate',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { rating, comment } = z
      .object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })
      .parse(req.body);
    await sessionService.rate(req.params.id, req.user!.sub, rating, comment);
    res.status(204).end();
  }),
);

sessionRouter.post(
  '/:id/crisis-flag',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    await sessionService.flagCrisis(req.params.id);
    res.status(202).end();
  }),
);

sessionRouter.post(
  '/:id/block',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    await sessionService.blockAgent(req.user!.sub, req.params.id);
    res.status(204).end();
  }),
);

sessionRouter.post(
  '/:id/report',
  requireAuth,
  requireRole('USER'),
  asyncHandler(async (req, res) => {
    const { reason, details } = z
      .object({
        reason: z.enum(['MISCONDUCT', 'INAPPROPRIATE', 'UNSAFE', 'OTHER']),
        details: z.string().max(1000).optional(),
      })
      .parse(req.body);
    const result = await sessionService.reportAgent({
      userId: req.user!.sub,
      sessionId: req.params.id,
      reason,
      details,
    });
    res.status(201).json(result);
  }),
);
