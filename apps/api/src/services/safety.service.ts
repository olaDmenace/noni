// Safety service — implements PRD S-001 to S-007.
// Every text message (user, agent, AI) MUST pass through this service before being forwarded.
import {
  CRISIS_KEYWORDS,
  CRISIS_RESPONSE_MESSAGE,
  MANI_HOTLINE,
  detectCrisis,
} from '@noni/ai-prompt';
import { env } from '../config/env.js';
import { prisma } from '../models/prisma.js';
import { publishToRoom, rooms } from '../realtime/publish.js';
import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';
import { smsService } from './sms.service.js';

export type CrisisTriggerSource = 'USER' | 'AGENT' | 'AI' | 'SYSTEM';
export type CrisisTriggeredBy = 'KEYWORD' | 'AGENT_FLAG' | 'AI_DETECTION';

export interface CrisisDetection {
  detected: boolean;
  matchedKeyword?: string;
  responseMessage: string;
  hotline: string;
}

export const safetyService = {
  hasCrisisKeyword(text: string): CrisisDetection {
    const result = detectCrisis(text);
    return {
      detected: result.matched,
      matchedKeyword: result.keyword,
      responseMessage: CRISIS_RESPONSE_MESSAGE,
      hotline: MANI_HOTLINE,
    };
  },

  async triggerCrisisProtocol(args: {
    sessionId: string;
    triggeredBy: CrisisTriggeredBy;
    triggerSource: CrisisTriggerSource;
    matchedKeyword?: string;
  }) {
    // 1. Persist the audit record (no message content).
    await prisma.crisisIncident.create({
      data: {
        sessionId: args.sessionId,
        triggeredBy: args.triggeredBy,
        triggerSource: args.triggerSource,
        matchedKeyword: args.matchedKeyword ?? null,
      },
    });

    // 2. Update session status.
    await prisma.session
      .update({
        where: { id: args.sessionId },
        data: { crisisFlag: true, crisisFlaggedAt: new Date() },
      })
      .catch((err: unknown) => logger.warn({ err, sessionId: args.sessionId }, 'crisis: session update failed'));

    // 3. Broadcast to the session's socket room (relayed by realtime/index.ts on
    //    every instance) so both parties see the alert immediately.
    await publishToRoom(rooms.session(args.sessionId), 'crisis_alert', {
      message: CRISIS_RESPONSE_MESSAGE,
      hotlineNumber: MANI_HOTLINE,
    });

    // 4. Notify the on-call supervisor (S-003 §4): SMS if configured, push +
    //    realtime event to every admin. Never includes message content.
    if (env.SUPERVISOR_PHONE) {
      await smsService
        .send(
          env.SUPERVISOR_PHONE,
          `NONI CRISIS ALERT — session ${args.sessionId.slice(0, 8)} flagged (${args.triggeredBy}). Open the admin console now.`,
        )
        .catch((err: unknown) => logger.error({ err }, 'supervisor SMS failed'));
    }
    await publishToRoom(rooms.admins(), 'crisis_incident', {
      sessionId: args.sessionId,
      triggeredBy: args.triggeredBy,
      triggerSource: args.triggerSource,
    });
    await notificationService.pushToAdmins({
      title: 'CRISIS ALERT',
      body: 'A session has been crisis-flagged. Review immediately.',
      data: { sessionId: args.sessionId, type: 'CRISIS' },
    });

    logger.warn(
      {
        sessionId: args.sessionId,
        triggeredBy: args.triggeredBy,
        triggerSource: args.triggerSource,
        matchedKeyword: args.matchedKeyword,
      },
      'CRISIS PROTOCOL ACTIVATED',
    );
  },

  // Exposed for ops to verify the keyword list at runtime without leaking it
  // through normal logs. Returns count only.
  getKeywordCount(): number {
    return CRISIS_KEYWORDS.length;
  },
};
