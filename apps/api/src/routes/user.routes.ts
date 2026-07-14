import { Router } from 'express';
import { z } from 'zod';
import { Tier } from '@noni/types';
import { requireAuth } from '../middleware/auth.js';
import { notificationService } from '../services/notification.service.js';
import { userService } from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const userRouter = Router();

userRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await userService.me(req.user!.sub));
  }),
);

userRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const patch = z
      .object({
        tierPreference: z.nativeEnum(Tier).optional(),
        alias: z.string().min(2).max(24).optional(),
      })
      .parse(req.body);
    res.json(await userService.updatePreferences(req.user!.sub, patch));
  }),
);

userRouter.post(
  '/me/pin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { pin } = z.object({ pin: z.string() }).parse(req.body);
    await userService.setPin(req.user!.sub, pin);
    res.status(204).end();
  }),
);

userRouter.post(
  '/me/pin/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { pin } = z.object({ pin: z.string() }).parse(req.body);
    await userService.verifyPin(req.user!.sub, pin);
    res.status(204).end();
  }),
);

userRouter.delete(
  '/me/pin',
  requireAuth,
  asyncHandler(async (req, res) => {
    await userService.clearPin(req.user!.sub);
    res.status(204).end();
  }),
);

userRouter.post(
  '/me/push-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token, platform } = z
      .object({ token: z.string().min(8), platform: z.enum(['IOS', 'ANDROID']) })
      .parse(req.body);
    await notificationService.registerToken(req.user!.sub, token, platform);
    res.status(204).end();
  }),
);

userRouter.delete(
  '/me/push-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(8) }).parse(req.body);
    await notificationService.unregisterToken(token);
    res.status(204).end();
  }),
);

// NDPC right-to-erasure. Irreversible.
userRouter.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    await userService.deleteAccount(req.user!.sub);
    res.status(204).end();
  }),
);
