// Agent onboarding pipeline — F-030. Replaces manual SQL role promotion:
// users apply, admins verify identity out-of-band and approve in the console,
// approval flips the role and creates the agent profile. The crisis-training
// gate (S-006) and the practice bot remain mandatory before going online.
import type { SessionType } from '@noni/types';
import { prisma } from '../models/prisma.js';
import { publishToRoom, rooms } from '../realtime/publish.js';
import { BadRequest, Conflict, NotFound } from '../utils/errors.js';
import { notificationService } from './notification.service.js';

export const applicationService = {
  async apply(args: {
    userId: string;
    motivation: string;
    specialties: string[];
    languages: string[];
    sessionTypes: SessionType[];
  }) {
    const existingAgent = await prisma.agent.findUnique({ where: { userId: args.userId } });
    if (existingAgent) throw Conflict('ALREADY_AGENT', 'You are already a listener');
    const existing = await prisma.agentApplication.findUnique({ where: { userId: args.userId } });
    if (existing?.status === 'PENDING') {
      throw Conflict('APPLICATION_PENDING', 'Your application is under review');
    }

    const data = {
      motivation: args.motivation,
      specialties: args.specialties,
      languages: args.languages,
      sessionTypes: args.sessionTypes,
      status: 'PENDING',
      reviewedBy: null,
      reviewedAt: null,
    };
    const app = existing
      ? await prisma.agentApplication.update({ where: { userId: args.userId }, data })
      : await prisma.agentApplication.create({ data: { userId: args.userId, ...data } });

    await publishToRoom(rooms.admins(), 'agent_application', { applicationId: app.id });
    await notificationService.pushToAdmins({
      title: 'New listener application',
      body: 'Review the application in the admin console.',
      data: { applicationId: app.id, type: 'AGENT_APPLICATION' },
    });
    return { applicationId: app.id, status: app.status };
  },

  async myApplication(userId: string) {
    const app = await prisma.agentApplication.findUnique({ where: { userId } });
    return app
      ? { applicationId: app.id, status: app.status, createdAt: app.createdAt.toISOString() }
      : null;
  },

  async listPending() {
    return prisma.agentApplication.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  },

  async review(applicationId: string, adminId: string, approve: boolean) {
    const app = await prisma.agentApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw NotFound('APPLICATION_NOT_FOUND', 'Application not found');
    if (app.status !== 'PENDING') throw BadRequest('ALREADY_REVIEWED', 'Application already settled');

    if (!approve) {
      await prisma.agentApplication.update({
        where: { id: app.id },
        data: { status: 'REJECTED', reviewedBy: adminId, reviewedAt: new Date() },
      });
      await notificationService.push(app.userId, {
        title: 'Application update',
        body: 'We could not approve your listener application at this time.',
        data: { type: 'APPLICATION_REJECTED' },
      });
      return { status: 'REJECTED' };
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: app.userId } });
    await prisma.$transaction([
      prisma.agentApplication.update({
        where: { id: app.id },
        data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
      }),
      prisma.user.update({ where: { id: app.userId }, data: { role: 'AGENT' } }),
      prisma.agent.create({
        data: {
          userId: app.userId,
          alias: user.alias,
          specialties: app.specialties,
          languages: app.languages,
          sessionTypes: app.sessionTypes,
        },
      }),
    ]);
    await notificationService.push(app.userId, {
      title: 'You are approved!',
      body: 'Sign in again, complete crisis training and the practice session, then go online.',
      data: { type: 'APPLICATION_APPROVED' },
    });
    return { status: 'APPROVED' };
  },
};
