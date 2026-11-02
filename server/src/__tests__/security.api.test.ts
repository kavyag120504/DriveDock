/**
 * Phase 2 security hardening: helmet headers, CORS allowlist and NoSQL/prototype
 * input sanitisation. These pin the new behaviour and prove the additions are
 * backwards-compatible (empty allowlist ⇒ reflect any origin; clean input untouched).
 */

import express from 'express';
import request from 'supertest';

import { app } from '../index';
import {
  parseAllowedOrigins,
  buildCorsOptions,
  stripDangerousKeys,
  sanitizeRequest
} from '../middleware/security';

describe('helmet security headers (real app)', () => {
  it('hides x-powered-by and sets hardening headers on /healthz', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    // Uploaded images must stay embeddable cross-origin by the web build.
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});

describe('parseAllowedOrigins', () => {
  it('splits, trims, drops blanks and de-duplicates', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('  ')).toEqual([]);
    expect(
      parseAllowedOrigins('https://a.com, https://b.com ,, https://a.com')
    ).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('buildCorsOptions origin check', () => {
  // cors passes (origin, callback); callback(err, allowed:boolean).
  const check = (allowed: string[], origin: string | undefined): boolean => {
    const fn = buildCorsOptions(allowed).origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void
    ) => void;
    let result = false;
    fn(origin, (_e, allow) => {
      result = !!allow;
    });
    return result;
  };

  it('allows any origin when the allowlist is empty (dev/default behaviour)', () => {
    expect(check([], 'https://anything.com')).toBe(true);
  });

  it('allows requests with no Origin header (native app, curl)', () => {
    expect(check(['https://app.drivedock.in'], undefined)).toBe(true);
  });

  it('allows a listed origin and blocks an unlisted one', () => {
    expect(check(['https://app.drivedock.in'], 'https://app.drivedock.in')).toBe(true);
    expect(check(['https://app.drivedock.in'], 'https://evil.com')).toBe(false);
  });
});

describe('stripDangerousKeys', () => {
  it('removes $-prefixed, dotted and __proto__ keys, recursively', () => {
    const body: any = {
      email: 'a@b.com',
      password: { $ne: null },
      'a.b': 1,
      nested: { ok: 1, $gt: 2, deeper: { $where: 'x', keep: 3 } },
      list: [{ $in: [1] }, { fine: 1 }]
    };
    const removed = stripDangerousKeys(body);

    expect(body).toEqual({
      email: 'a@b.com',
      password: {},
      nested: { ok: 1, deeper: { keep: 3 } },
      list: [{}, { fine: 1 }]
    });
    expect(removed).toBe(5); // $ne, a.b, $gt, $where, $in
  });

  it('leaves clean input completely untouched', () => {
    const clean = { email: 'a@b.com', nums: [1, 2, 3], nested: { ok: true } };
    const copy = JSON.parse(JSON.stringify(clean));
    expect(stripDangerousKeys(clean)).toBe(0);
    expect(clean).toEqual(copy);
  });

  it('is a no-op on primitives and null', () => {
    expect(stripDangerousKeys(null)).toBe(0);
    expect(stripDangerousKeys('x')).toBe(0);
    expect(stripDangerousKeys(42)).toBe(0);
  });
});

describe('sanitizeRequest middleware (integration)', () => {
  const echoApp = express();
  echoApp.use(express.json());
  echoApp.use(sanitizeRequest);
  echoApp.post('/echo', (req, res) => res.json({ body: req.body, query: req.query }));

  it('strips operator injection from body before the handler sees it', async () => {
    const res = await request(echoApp)
      .post('/echo?role=owner&bad[$ne]=1')
      .send({ email: 'a@b.com', password: { $ne: 'x' } });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ email: 'a@b.com', password: {} });
    // Nested $ne inside query key "bad" is stripped; plain query survives.
    expect(res.body.query.role).toBe('owner');
    expect(JSON.stringify(res.body.query)).not.toContain('$ne');
  });

  it('passes clean requests through unchanged', async () => {
    const res = await request(echoApp).post('/echo').send({ email: 'a@b.com', n: 1 });
    expect(res.body.body).toEqual({ email: 'a@b.com', n: 1 });
  });
});
