import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@noni/types';
import { env } from '../config/env.js';
import { Forbidden, Unauthorized } from '../utils/errors.js';

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(Unauthorized('NO_TOKEN', 'Missing token'));

  try {
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    next(Unauthorized('INVALID_TOKEN', 'Invalid or expired token'));
  }
};

export const requireRole =
  (...allowed: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Unauthorized());
    if (!allowed.includes(req.user.role)) return next(Forbidden());
    next();
  };
