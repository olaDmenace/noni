// Admin console — S-005 report review, crisis incident audit, F-035 flags.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { prisma } from '../models/prisma.js';
import { applicationService } from '../services/application.service.js';
import { orgService } from '../services/org.service.js';
import { safetyService } from '../services/safety.service.js';
import { sessionService } from '../services/session.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFound } from '../utils/errors.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get(
  '/safety/keyword-count',
  asyncHandler(async (_req, res) => {
    res.json({ count: safetyService.getKeywordCount() });
  }),
);

// S-005: reports pending review (oldest first — the 24h clock is ticking).
adminRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['pending', 'resolved']).default('pending') }).parse(req.query);
    const reports = await prisma.agentReport.findMany({
      where: status === 'pending' ? { reviewedAt: null } : { reviewedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { agent: { select: { alias: true, isSuspended: true, ratingAvg: true } } },
    });
    // Ciphertext never leaves the API — reviewers fetch decrypted evidence explicitly.
    res.json({
      reports: reports.map(({ evidenceEncrypted: _evidence, ...r }) => ({
        ...r,
        hasEvidence: Boolean(_evidence),
      })),
    });
  }),
);

// S-005: reporter-consented chat excerpt for a report under review.
adminRouter.get(
  '/reports/:id/evidence',
  asyncHandler(async (req, res) => {
    const messages = await sessionService.getReportEvidence(req.params.id);
    res.json({ messages });
  }),
);

adminRouter.post(
  '/reports/:id/resolve',
  asyncHandler(async (req, res) => {
    const { outcome, notes } = z
      .object({
        outcome: z.enum(['NO_ACTION', 'WARNED', 'SUSPENDED', 'BANNED']),
        notes: z.string().max(2000).optional(),
      })
      .parse(req.body);
    const report = await prisma.agentReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw NotFound('REPORT_NOT_FOUND', 'Report not found');

    await prisma.$transaction([
      prisma.agentReport.update({
        where: { id: report.id },
        data: {
          reviewedAt: new Date(),
          reviewedBy: req.user!.sub,
          outcome,
          // Zero-retention promise: consented evidence lives only as long as the review.
          evidenceEncrypted: null,
          ...(notes ? { details: `${report.details ?? ''}\n[admin] ${notes}`.trim() } : {}),
        },
      }),
      ...(['SUSPENDED', 'BANNED'].includes(outcome)
        ? [
            prisma.agent.update({
              where: { id: report.agentId },
              data: { isSuspended: true, status: 'OFFLINE' },
            }),
          ]
        : []),
    ]);
    res.status(204).end();
  }),
);

adminRouter.get(
  '/crisis-incidents',
  asyncHandler(async (req, res) => {
    const { resolved } = z.object({ resolved: z.coerce.boolean().default(false) }).parse(req.query);
    const incidents = await prisma.crisisIncident.findMany({
      where: { resolved },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ incidents });
  }),
);

adminRouter.post(
  '/crisis-incidents/:id/resolve',
  asyncHandler(async (req, res) => {
    const { notes } = z.object({ notes: z.string().max(2000).optional() }).parse(req.body);
    await prisma.crisisIncident.update({
      where: { id: req.params.id },
      data: { resolved: true, resolvedAt: new Date(), notes: notes ?? null },
    });
    res.status(204).end();
  }),
);

// F-035: agents flagged for low ratings, plus suspended agents.
adminRouter.get(
  '/agents/flagged',
  asyncHandler(async (_req, res) => {
    const agents = await prisma.agent.findMany({
      where: { OR: [{ flaggedForReview: true }, { isSuspended: true }] },
      select: {
        id: true,
        alias: true,
        ratingAvg: true,
        ratingCount: true,
        isSuspended: true,
        flaggedForReview: true,
      },
    });
    res.json({ agents });
  }),
);

// F-030: listener application review.
adminRouter.get(
  '/applications',
  asyncHandler(async (_req, res) => {
    res.json({ applications: await applicationService.listPending() });
  }),
);

adminRouter.post(
  '/applications/:id/review',
  asyncHandler(async (req, res) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    res.json(await applicationService.review(req.params.id, req.user!.sub, approve));
  }),
);

// B2B: organizations and access codes.
adminRouter.post(
  '/orgs',
  asyncHandler(async (req, res) => {
    const { name, contactNote } = z
      .object({ name: z.string().min(2).max(120), contactNote: z.string().max(500).optional() })
      .parse(req.body);
    res.status(201).json(await orgService.createOrg(name, contactNote));
  }),
);

adminRouter.get(
  '/orgs',
  asyncHandler(async (_req, res) => {
    res.json({ orgs: await orgService.listOrgs() });
  }),
);

adminRouter.post(
  '/orgs/:id/codes',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        tier: z.enum(['T6', 'T7']),
        count: z.number().int().min(1).max(500),
        maxRedemptions: z.number().int().min(1).max(10000).optional(),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    res.status(201).json({
      codes: await orgService.createCodes({
        orgId: req.params.id,
        tier: body.tier,
        count: body.count,
        maxRedemptions: body.maxRedemptions,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      }),
    });
  }),
);

adminRouter.post(
  '/agents/:id/reinstate',
  asyncHandler(async (req, res) => {
    await prisma.agent.update({
      where: { id: req.params.id },
      data: { isSuspended: false, flaggedForReview: false },
    });
    res.status(204).end();
  }),
);
