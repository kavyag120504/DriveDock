import { Request, Response, NextFunction } from 'express';

// multer reports its own errors by code rather than by HTTP status
const uploadErrorStatus = (err: any): number | undefined => {
  if (err?.code === 'LIMIT_FILE_SIZE') return 413;
  if (err?.name === 'MulterError') return 400;
  return undefined;
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[DriveDock Error Handler]:', err);

  const statusCode = err.statusCode || uploadErrorStatus(err) || (res.statusCode === 200 ? 500 : res.statusCode);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. The limit is 10 MB.' : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
};
