// Push notifications via FCM (firebase-admin). With no service account configured
// the service degrades to structured logs so every dev flow still works.
import { prisma } from '../models/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

type Messaging = {
  send: (msg: {
    token: string;
    notification: { title: string; body: string };
    data?: Record<string, string>;
  }) => Promise<string>;
};

let messaging: Messaging | null | undefined; // undefined = not initialised yet

async function getMessaging(): Promise<Messaging | null> {
  if (messaging !== undefined) return messaging;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    messaging = null;
    return null;
  }
  messaging = null;
  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = initializeApp({
      credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as Record<string, string>),
    });
    messaging = getMessaging(app);
  } catch (err) {
    logger.error({ err }, 'firebase-admin init failed — falling back to log-only pushes');
  }
  return messaging;
}

export const notificationService = {
  async push(userId: string, payload: PushPayload): Promise<void> {
    const fcm = await getMessaging();
    if (!fcm) {
      logger.info({ userId, payload }, 'push notification (dev log)');
      return;
    }
    const tokens = await prisma.pushToken.findMany({ where: { userId } });
    for (const t of tokens) {
      try {
        await fcm.send({
          token: t.token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
        });
      } catch (err) {
        // Dead token — prune it so we stop retrying.
        logger.debug({ err, token: t.id }, 'push failed, pruning token');
        await prisma.pushToken.delete({ where: { id: t.id } }).catch(() => undefined);
      }
    }
  },

  async pushToAdmins(payload: PushPayload): Promise<void> {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await Promise.all(admins.map((a) => this.push(a.id, payload)));
  },

  async registerToken(userId: string, token: string, platform: 'IOS' | 'ANDROID'): Promise<void> {
    await prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  },

  async unregisterToken(token: string): Promise<void> {
    await prisma.pushToken.deleteMany({ where: { token } });
  },
};
