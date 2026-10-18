import { Request, Response, NextFunction } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// req.ip honours the app's 'trust proxy' setting (TRUST_PROXY), so a client-sent
// X-Forwarded-For header can't be used to get a fresh limit on every request
function getKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// Drop expired windows now and then so the in-memory store doesn't grow without bound
const MAX_TRACKED_KEYS = 10000;
function pruneExpired(now: number): void {
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export function rateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getKey(req);
    const now = Date.now();
    if (store.size > MAX_TRACKED_KEYS) pruneExpired(now);
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        message: `Too many requests. Try again in ${retryAfter} seconds.`
      });
      return;
    }

    next();
  };
}
