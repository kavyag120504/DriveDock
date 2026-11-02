/**
 * Transport- and input-level security middleware (Phase 2 hardening).
 *
 *  - securityHeaders: helmet with API-appropriate defaults (no HTML is served, but
 *    uploaded images must stay embeddable cross-origin by the web build).
 *  - corsMiddleware: env-driven allowlist. Empty list → reflect any Origin (the
 *    previous `cors()` behaviour, kept for development). The native app sends no
 *    Origin, so a strict allowlist never blocks it — it only constrains browsers.
 *  - sanitizeRequest: strips MongoDB operator keys ($-prefixed), dotted keys and
 *    __proto__ from the request, defusing NoSQL-operator injection and prototype
 *    pollution before any controller reads req.body / req.query / req.params.
 *
 * All three are additive: with no CORS_ALLOWED_ORIGINS set and well-formed input,
 * behaviour is unchanged, so the existing characterization tests stay green.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import { ENV } from '../config/env';

/** helmet, tuned for a JSON API that also serves uploaded images from /uploads. */
export const securityHeaders: RequestHandler = helmet({
  // Uploaded images are fetched by the web build from a different origin; same-origin
  // (helmet's default) would block them. Headers still hide x-powered-by, set nosniff,
  // frameguard, HSTS (only honoured over HTTPS), etc.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

/** Parse CORS_ALLOWED_ORIGINS into a trimmed, de-duplicated list of origins. */
export const parseAllowedOrigins = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
    )
  );

/** Build the cors() options for the configured allowlist (empty list ⇒ reflect any origin). */
export const buildCorsOptions = (allowed: string[]): CorsOptions => ({
  origin: (origin, callback) => {
    // No Origin header (native app, curl, server-to-server) is always allowed.
    // Empty allowlist keeps the previous permissive behaviour.
    if (!origin || allowed.length === 0 || allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false); // no ACAO header → the browser blocks the response
  }
});

export const corsMiddleware: RequestHandler = cors(
  buildCorsOptions(parseAllowedOrigins(ENV.CORS_ALLOWED_ORIGINS))
);

// Keys that must never reach a Mongo query or an object merge.
const isDangerousKey = (key: string): boolean =>
  key.startsWith('$') || key.includes('.') || key === '__proto__';

/**
 * Recursively delete dangerous keys in place. Returns how many were removed so the
 * caller can log abuse. Handles nested objects and arrays; leaves values untouched.
 */
export const stripDangerousKeys = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0;

  let removed = 0;
  if (Array.isArray(value)) {
    for (const item of value) removed += stripDangerousKeys(item);
    return removed;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (isDangerousKey(key)) {
      delete (value as Record<string, unknown>)[key];
      removed += 1;
    } else {
      removed += stripDangerousKeys((value as Record<string, unknown>)[key]);
    }
  }
  return removed;
};

/** Middleware wrapper: sanitise body, query and params; never blocks the request. */
export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction): void => {
  stripDangerousKeys(req.body);
  stripDangerousKeys(req.query);
  stripDangerousKeys(req.params);
  next();
};
