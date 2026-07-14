import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authLimiter } from '../middleware/rate-limit.js';

export const authRouter = Router();

const phoneSchema = z.object({ phone: z.string().min(8).max(20) });
const verifySchema = z.object({ phone: z.string().min(8).max(20), code: z.string().length(6) });

authRouter.post(
  '/request-otp',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = phoneSchema.parse(req.body);
    await authService.requestOtp(phone);
    res.status(204).end();
  }),
);

authRouter.post(
  '/verify-otp',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone, code } = verifySchema.parse(req.body);
    const tokens = await authService.verifyOtp(phone, code);
    res.json(tokens);
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    res.json(tokens);
  }),
);
