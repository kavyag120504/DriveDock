import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Prefer the per-request child logger (carries the request id) when present.
  const log = (req as any).log || logger;
  log.error({ err, path: req.originalUrl, method: req.method }, 'Request failed');

  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    stack: isProduction() ? undefined : err.stack
  });
};
