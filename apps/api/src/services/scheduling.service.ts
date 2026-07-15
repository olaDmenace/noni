// Advance scheduling — F-010. T6/T7 subscribers book an agent + timeslot up to
// 7 days ahead. A sweeper converts due bookings into real queued sessions with
// the booked agent preferred, so normal matching/billing rules apply.
import type { SessionType, Tier } from '@noni/types';
import { prisma } from '../models/prisma.js';
import { BadRequest, Forbidden, NotFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';
import { sessionService } from './session.service.js';

const MAX_AHEAD_DAYS = 7;
const MIN_AHEAD_MINS = 30;
const SLOT_CLASH_MINS = 30;

const BOOKABLE_TIERS: Tier[] = ['T1', 'T3'];

export const schedulingService = {
  async create(args: {
    userId: string;
    agentId: string;
    tier: Tier;
    sessionType: SessionType;
    scheduledAt: Date;
  }) {
    const sub = await prisma.subscription.findUnique({ where: { userId: args.userId } });
    if (!sub?.isActive || sub.pausedAt) {
      throw Forbidden('SUBSCRIPTION_REQUIRED', 'Advance booking is a T6/T7 subscriber perk');
    }
    if (!BOOKABLE_TIERS.includes(args.tier)) {
      throw BadRequest('INVALID_TIER', 'Book T1 (text) or T3 (voice) sessions in advance');
    }
    const now = Date.now();
    const at = args.scheduledAt.getTime();
    if (at < now + MIN_AHEAD_MINS * 60_000) {
      throw BadRequest('TOO_SOON', `Book at least ${MIN_AHEAD_MINS} minutes ahead`);
    }
    if (at > now + MAX_AHEAD_DAYS * 24 * 60 * 60_000) {
      throw BadRequest('TOO_FAR', `Book at most ${MAX_AHEAD_DAYS} days ahead`);
    }

    const agent = await prisma.agent.findUnique({ where: { id: args.agentId } });
    if (!agent || agent.isSuspended || !agent.crisisTrainingPassedAt) {
      throw NotFound('AGENT_NOT_FOUND', 'Listener unavailable');
    }
    if (!agent.sessionTypes.includes(args.sessionType)) {
      throw BadRequest('TYPE_NOT_OFFERED', 'This listener does not offer that session type');
    }

    // Reject clashes with the agent's existing bookings (±30 min window).
    const clash = await prisma.scheduledSession.findFirst({
      where: {
        agentId: args.agentId,
        status: 'BOOKED',
        scheduledAt: {
          gte: new Date(at - SLOT_CLASH_MINS * 60_000),
          lte: new Date(at + SLOT_CLASH_MINS * 60_000),
        },
      },
    });
    if (clash) throw BadRequest('SLOT_TAKEN', 'That timeslot is already booked');

    const booking = await prisma.scheduledSession.create({
      data: {
        userId: args.userId,
        agentId: args.agentId,
        tier: args.tier,
        sessionType: args.sessionType,
        scheduledAt: args.scheduledAt,
      },
    });
    await notificationService.push(agent.userId, {
      title: 'New booking',
      body: `A session is booked for ${args.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
      data: { type: 'BOOKING', bookingId: booking.id },
    });
    return serialize(booking);
  },

  async listMine(userId: string) {
    const rows = await prisma.scheduledSession.findMany({
      where: { userId, status: 'BOOKED' },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(serialize);
  },

  async listForAgent(agentUserId: string) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');
    const rows = await prisma.scheduledSession.findMany({
      where: { agentId: agent.id, status: 'BOOKED' },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(serialize);
  },

  async cancel(bookingId: string, userId: string) {
    const booking = await prisma.scheduledSession.findUnique({ where: { id: bookingId } });
    if (!booking) throw NotFound('BOOKING_NOT_FOUND', 'Booking not found');
    if (booking.userId !== userId) throw Forbidden();
    if (booking.status !== 'BOOKED') throw BadRequest('NOT_CANCELLABLE', 'Booking already settled');
    await prisma.scheduledSession.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });
  },

  /** Sweeper hook: convert due bookings into live queued sessions. */
  async sweepDue(): Promise<void> {
    const due = await prisma.scheduledSession.findMany({
      where: { status: 'BOOKED', scheduledAt: { lte: new Date() } },
      take: 20,
    });
    for (const booking of due) {
      try {
        const result = await sessionService.create({
          userId: booking.userId,
          tier: booking.tier as Tier,
          sessionType: booking.sessionType as SessionType,
          preferredAgentId: booking.agentId,
        });
        await prisma.scheduledSession.update({
          where: { id: booking.id },
          data: { status: 'STARTED', sessionId: result.session.id },
        });
        await notificationService.push(booking.userId, {
          title: 'Your booked session is starting',
          body: 'Open Noni — your listener is being connected now.',
          data: { type: 'BOOKING_STARTED', sessionId: result.session.id },
        });
      } catch (err) {
        // Most likely INSUFFICIENT_FUNDS with an exhausted bundle.
        await prisma.scheduledSession.update({
          where: { id: booking.id },
          data: { status: 'MISSED' },
        });
        await notificationService.push(booking.userId, {
          title: 'Booked session could not start',
          body: 'Your bundle is out of sessions and your wallet balance was too low.',
          data: { type: 'BOOKING_MISSED' },
        });
        logger.info({ err, bookingId: booking.id }, 'scheduled session could not start');
      }
    }
  },
};

type DbBooking = {
  id: string;
  userId: string;
  agentId: string;
  tier: string;
  sessionType: string;
  scheduledAt: Date;
  status: string;
  sessionId: string | null;
};

function serialize(b: DbBooking) {
  return {
    id: b.id,
    userId: b.userId,
    agentId: b.agentId,
    tier: b.tier,
    sessionType: b.sessionType,
    scheduledAt: b.scheduledAt.toISOString(),
    status: b.status,
    sessionId: b.sessionId,
  };
}
