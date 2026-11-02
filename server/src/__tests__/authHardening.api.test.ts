/**
 * Phase 2 auth hardening: stateful rotating refresh tokens + server-side revocation
 * + device/session list + "log out everywhere".
 *
 * Pins the NEW guarantees:
 *  - /refresh rotates: the presented token is single-use; a second use is rejected;
 *  - reusing an already-rotated token is treated as theft → the whole family is
 *    revoked (even the legitimately-rotated successor stops working);
 *  - /logout revokes the presented refresh token on that device;
 *  - /logout-all revokes every active session;
 *  - /sessions lists active sessions with a device label.
 *
 * Users are seeded directly (helpers.makeOwner) and tokens obtained via HTTP /login,
 * so the signup rate-limiter is never touched. Successful logins are not rate-limited.
 */

import express from 'express';
import request from 'supertest';

import authRoutes from '../routes/authRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { RefreshToken } from '../models/RefreshToken';
import { setupTestDB, teardownTestDB, clearDB, makeOwner } from './helpers';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

const PASSWORD = 'password1'; // helpers.makeUser hashes this by default

const login = (email: string, ua = 'JestPhone/1.0') =>
  request(app).post('/auth/login').set('User-Agent', ua).send({ email, password: PASSWORD });

describe('refresh-token rotation', () => {
  it('rotates on use: the old token is single-use and reuse revokes the family', async () => {
    const owner = await makeOwner();
    const first = await login(owner.email);
    const r1 = first.body.data.refreshToken as string;

    // First rotation succeeds and returns a different token.
    const rot = await request(app).post('/auth/refresh').send({ refreshToken: r1 });
    expect(rot.status).toBe(200);
    const r2 = rot.body.data.refreshToken as string;
    expect(r2).toBeDefined();
    expect(r2).not.toBe(r1);
    expect(rot.body.data.accessToken).toBeDefined();

    // Reusing r1 is detected as theft: 401 + REFRESH_REUSE, and the family is revoked.
    const reuse = await request(app).post('/auth/refresh').send({ refreshToken: r1 });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_REUSE');

    // Because the family was revoked, even the legitimate successor r2 no longer works.
    const afterReuse = await request(app).post('/auth/refresh').send({ refreshToken: r2 });
    expect(afterReuse.status).toBe(401);

    // No active sessions remain for this user.
    const active = await RefreshToken.countDocuments({ userId: owner._id, revokedAt: null });
    expect(active).toBe(0);
  });

  it('a forged/garbage refresh token is rejected before the store is touched (401)', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'not.a.jwt' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined(); // not a reuse — just invalid
  });
});

describe('logout + sessions', () => {
  it('logout revokes the presented refresh token on that device', async () => {
    const owner = await makeOwner();
    const res = await login(owner.email);
    const { accessToken, refreshToken } = res.body.data;

    const out = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(out.status).toBe(200);

    const reuse = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });

  it('lists active sessions and "log out everywhere" revokes them all', async () => {
    const owner = await makeOwner();
    const a = await login(owner.email, 'DeviceA/1.0');
    const b = await login(owner.email, 'DeviceB/2.0');
    const rA = a.body.data.refreshToken as string;
    const rB = b.body.data.refreshToken as string;

    const sessions = await request(app)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`);
    expect(sessions.status).toBe(200);
    expect(sessions.body.data).toHaveLength(2);
    const devices = sessions.body.data.map((s: any) => s.device).sort();
    expect(devices).toEqual(['DeviceA/1.0', 'DeviceB/2.0']);

    const all = await request(app)
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.revoked).toBe(2);

    // Both refresh tokens are now dead.
    expect((await request(app).post('/auth/refresh').send({ refreshToken: rA })).status).toBe(401);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: rB })).status).toBe(401);

    const after = await request(app)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`);
    expect(after.body.data).toHaveLength(0);
  });
});
