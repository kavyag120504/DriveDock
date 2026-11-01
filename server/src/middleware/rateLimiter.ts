import { Request, Response, NextFunction } from 'express';

interface Window {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Count only requests that end in a 4xx (e.g. wrong password), so successful use never locks anyone out. */
  countFailuresOnly?: boolean;
}

// req.ip honours the app's 'trust proxy' setting (TRUST_PROXY), so a client-sent
// X-Forwarded-For header can't be used to get a fresh limit on every request
function getKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const MAX_TRACKED_KEYS = 10000;

export function rateLimiter(maxRequests: number, windowMs: number, options: RateLimiterOptions = {}) {
  // Each limiter keeps its own counters, so login attempts never eat into the signup allowance
  const store = new Map<string, Window>();

  // Drop expired windows now and then so the store doesn't grow without bound
  const pruneExpired = (now: number): void => {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  };

  const record = (key: string, now: number): Window => {
    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      const fresh = { count: 1, resetAt: now + windowMs };
      store.set(key, fresh);
      return fresh;
    }
    entry.count++;
    return entry;
  };

  const reject = (res: Response, entry: Window, now: number): void => {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      success: false,
      message: `Too many requests. Try again in ${retryAfter} seconds.`
    });
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = getKey(req);
    const now = Date.now();
    if (store.size > MAX_TRACKED_KEYS) pruneExpired(now);

    if (options.countFailuresOnly) {
      const entry = store.get(key);
      if (entry && now <= entry.resetAt && entry.count >= maxRequests) {
        reject(res, entry, now);
        return;
      }
      res.on('finish', () => {
        if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
          record(key, Date.now());
        }
      });
      next();
      return;
    }

    const entry = record(key, now);
    if (entry.count > maxRequests) {
      reject(res, entry, now);
      return;
    }
    next();
  };
}
