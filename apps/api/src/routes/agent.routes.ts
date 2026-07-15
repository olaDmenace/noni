import { Router } from 'express';
import { z } from 'zod';
import { AgentStatus, SessionType } from '@noni/types';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { agentService } from '../services/agent.service.js';
import { aiService } from '../services/ai.service.js';
import { applicationService } from '../services/application.service.js';
import { schedulingService } from '../services/scheduling.service.js';
import { trainingService } from '../services/training.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const agentRouter = Router();

// F-006: public (authenticated) browse list — mounted at GET /v1/agents.
agentRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        sessionType: z.nativeEnum(SessionType).optional(),
        specialty: z.string().optional(),
        language: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(req.query);
    res.json(await agentService.list(query));
  }),
);

agentRouter.get(
  '/me/dashboard',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json(await agentService.dashboard(req.user!.sub));
  }),
);

agentRouter.patch(
  '/me/status',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.nativeEnum(AgentStatus) }).parse(req.body);
    await agentService.setStatus(req.user!.sub, status);
    res.status(204).end();
  }),
);

agentRouter.get(
  '/me/queue',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json({ requests: await agentService.listQueue(req.user!.sub) });
  }),
);

// F-032: accept or pass an assigned session.
agentRouter.post(
  '/me/queue/:sessionId/accept',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json(await agentService.accept(req.user!.sub, req.params.sessionId));
  }),
);

agentRouter.post(
  '/me/queue/:sessionId/pass',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    await agentService.pass(req.user!.sub, req.params.sessionId);
    res.status(204).end();
  }),
);

// F-031: profile self-service.
agentRouter.patch(
  '/me/profile',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    const patch = z
      .object({
        specialties: z.array(z.string().min(2).max(40)).max(10).optional(),
        languages: z.array(z.string().min(2).max(20)).max(5).optional(),
        sessionTypes: z.array(z.nativeEnum(SessionType)).min(1).optional(),
        bankCode: z.string().min(2).max(10).optional(),
        bankAccountName: z.string().min(2).max(80).optional(),
        bankAccountNumber: z.string().regex(/^\d{10}$/).optional(),
      })
      .parse(req.body);
    res.json(await agentService.updateProfile(req.user!.sub, patch));
  }),
);

agentRouter.post(
  '/me/payout/request',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.status(202).json(await agentService.requestPayout(req.user!.sub));
  }),
);

agentRouter.get(
  '/me/payouts',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json({ payouts: await agentService.listPayouts(req.user!.sub) });
  }),
);

// F-030: apply to become a listener (any signed-in user).
agentRouter.post(
  '/apply',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        motivation: z.string().min(20).max(2000),
        specialties: z.array(z.string().min(2).max(40)).min(1).max(10),
        languages: z.array(z.string().min(2).max(20)).min(1).max(5),
        sessionTypes: z.array(z.nativeEnum(SessionType)).min(1),
      })
      .parse(req.body);
    res.status(201).json(await applicationService.apply({ userId: req.user!.sub, ...body }));
  }),
);

agentRouter.get(
  '/apply/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ application: await applicationService.myApplication(req.user!.sub) });
  }),
);

// F-030: practice session with the bot before going live.
agentRouter.post(
  '/me/practice/message',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    const { message } = z.object({ message: z.string().min(1).max(2000) }).parse(req.body);
    res.json(await aiService.practiceChat(req.user!.sub, message));
  }),
);

agentRouter.delete(
  '/me/practice',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    await aiService.resetPractice(req.user!.sub);
    res.status(204).end();
  }),
);

// F-010: the agent's upcoming booked sessions.
agentRouter.get(
  '/me/schedule',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    res.json({ bookings: await schedulingService.listForAgent(req.user!.sub) });
  }),
);

agentRouter.get(
  '/me/training/crisis',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (_req, res) => {
    res.json({ questions: trainingService.listQuiz() });
  }),
);

agentRouter.post(
  '/me/training/crisis/complete',
  requireAuth,
  requireRole('AGENT'),
  asyncHandler(async (req, res) => {
    const { answers } = z
      .object({
        answers: z
          .array(z.object({ questionId: z.string(), choice: z.string() }))
          .min(1)
          .max(20),
      })
      .parse(req.body);
    const result = await trainingService.completeCrisisTraining(req.user!.sub, answers);
    res.json(result);
  }),
);
