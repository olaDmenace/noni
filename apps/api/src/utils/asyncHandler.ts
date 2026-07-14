import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Wraps async route handlers so thrown errors flow into the error middleware.
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
