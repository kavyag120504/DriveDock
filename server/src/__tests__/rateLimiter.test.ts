/**
 * Unit tests for the rate-limiter factory, focused on the keyBy extension that
 * powers the per-user OCR scan limits (C3). No DB/network.
 */

import { rateLimiter, userKey, ipKey } from '../middleware/rateLimiter';

const makeRes = () => {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: null };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  res.on = () => res;
  return res;
};

const reqFor = (userId?: string, ip = '10.0.0.1') => ({ ip, socket: { remoteAddress: ip }, user: userId ? { userId } : undefined }) as any;

/** Run the middleware once; returns whether next() was called and the response mock. */
const run = (mw: any, req: any) => {
  const res = makeRes();
  let passed = false;
  mw(req, res, () => {
    passed = true;
  });
  return { passed, status: res.statusCode };
};

describe('rateLimiter keyBy', () => {
  test('per-user: one user hitting the limit does not affect another user', () => {
    const mw = rateLimiter(2, 60_000, { keyBy: userKey });
    const a = reqFor('userA');
    expect(run(mw, a).passed).toBe(true); // 1
    expect(run(mw, a).passed).toBe(true); // 2
    expect(run(mw, a).status).toBe(429); // 3 blocked

    // A different user has their own bucket
    expect(run(mw, reqFor('userB')).passed).toBe(true);
  });

  test('defaults to IP when no keyBy is given', () => {
    const mw = rateLimiter(1, 60_000);
    expect(run(mw, reqFor(undefined, '1.2.3.4')).passed).toBe(true);
    expect(run(mw, reqFor(undefined, '1.2.3.4')).status).toBe(429);
    expect(run(mw, reqFor(undefined, '5.6.7.8')).passed).toBe(true); // different IP
  });

  test('separate limiter instances keep independent stores (burst vs daily quota)', () => {
    const burst = rateLimiter(1, 60_000, { keyBy: userKey });
    const daily = rateLimiter(5, 86_400_000, { keyBy: userKey });
    const a = reqFor('userA');
    // burst allows 1 then blocks; daily is untouched and still allows
    expect(run(burst, a).passed).toBe(true);
    expect(run(burst, a).status).toBe(429);
    expect(run(daily, a).passed).toBe(true);
  });

  test('userKey falls back to IP for unauthenticated requests', () => {
    expect(userKey(reqFor('abc'))).toBe('user:abc');
    expect(userKey(reqFor(undefined, '9.9.9.9'))).toBe('9.9.9.9');
    expect(ipKey(reqFor(undefined, '9.9.9.9'))).toBe('9.9.9.9');
  });
});
