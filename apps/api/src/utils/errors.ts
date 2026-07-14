export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const BadRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const Unauthorized = (code = 'UNAUTHORIZED', msg = 'Unauthorized') =>
  new HttpError(401, code, msg);
export const Forbidden = (code = 'FORBIDDEN', msg = 'Forbidden') => new HttpError(403, code, msg);
export const NotFound = (code = 'NOT_FOUND', msg = 'Not found') => new HttpError(404, code, msg);
export const Conflict = (code: string, msg: string) => new HttpError(409, code, msg);
export const TooManyRequests = (msg = 'Too many requests') =>
  new HttpError(429, 'RATE_LIMITED', msg);
export const NotImplemented = (msg = 'Not implemented') =>
  new HttpError(501, 'NOT_IMPLEMENTED', msg);
