import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';

// multer reports its own errors by code rather than by HTTP status
const uploadErrorStatus = (err: any): number | undefined => {
  if (err?.code === 'LIMIT_FILE_SIZE') return 413;
  if (err?.name === 'MulterError') return 400;
  return undefined;
};

// A JSON/urlencoded body over REQUEST_BODY_LIMIT: body-parser throws an error with
// type 'entity.too.large' (and status 413). Give it a friendly message.
const isPayloadTooLarge = (err: any): boolean =>
  err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413;

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Prefer the per-request child logger (carries the request id) when present.
  const log = (req as any).log || logger;
  log.error({ err, path: req.originalUrl, method: req.method }, 'Request failed');

  const statusCode = err.statusCode || err.status || uploadErrorStatus(err) || (res.statusCode === 200 ? 500 : res.statusCode);
  const message = err.code === 'LIMIT_FILE_SIZE'
    ? 'File is too large. The limit is 10 MB.'
    : isPayloadTooLarge(err)
      ? 'Request body is too large.'
      : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    stack: isProduction() ? undefined : err.stack
  });
};
