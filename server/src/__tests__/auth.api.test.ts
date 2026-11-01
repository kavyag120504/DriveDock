/**
 * Characterization tests for the auth flow (signup, login, refresh, rate limit).
 * These pin CURRENT behaviour so later refactors (zod env, adapters) can't silently
 * change it. If a future phase deliberately changes behaviour, update these tests
 * in the same commit.
 */

import express from 'express';
import request from 'supertest';

import authRoutes from '../routes/authRoutes';
import { signup, login, refresh } from '../controllers/authController';
import { errorHandler } from '../middleware/errorHandler';
import { User } from '../models/User';
import { Provider } from '../models/Provider';
import { setupTestDB, teardownTestDB, clearDB } from './helpers';

// App WITHOUT the rate limiter: controllers mounted directly so functional tests
// never consume the shared in-memory limiter budget.
const app = express();
app.use(express.json());
app.post('/signup', signup);
app.post('/login', login);
app.post('/refresh', refresh);
app.use(errorHandler);

// App WITH the real authRoutes (incl. the 10-per-15min limiter) used only by the
// rate-limit suite. The limiter store is module-level and per-file in Jest.
const limitedApp = express();
limitedApp.use(express.json());
limitedApp.use('/auth', authRoutes);
limitedApp.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

const VALID = {
  name: 'Asha Owner',
  email: 'asha@test.com',
  phone: '9800000000',
  password: 'secret123'
};

describe('POST /auth/signup', () => {
  test('creates an owner and returns access + refresh tokens', async () => {
    const res = await request(app).post('/signup').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.role).toBe('owner');
    // Password hash must never leak to the client
    expect(JSON.stringify(res.body)).not.toContain(VALID.password);
  });

  test('defaults role to owner when omitted', async () => {
    const res = await request(app).post('/signup').send({ ...VALID, role: undefined });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('owner');
  });

  test('signing up as provider creates a pending Provider record', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ ...VALID, email: 'garage@test.com', role: 'provider', businessName: 'Garage X' });
    expect(res.status).toBe(201);
    const provider = await Provider.findOne({ businessName: 'Garage X' });
    expect(provider).not.toBeNull();
    expect(provider!.status).toBe('pending');
  });

  test.each(['officer', 'government', 'admin'])(
    'rejects public signup with privileged role "%s" (400)',
    async (role) => {
      const res = await request(app)
        .post('/signup')
        .send({ ...VALID, email: `${role}@test.com`, role });
      expect(res.status).toBe(400);
      await expect(User.findOne({ email: `${role}@test.com` })).resolves.toBeNull();
    }
  );

  test('rejects password shorter than 8 chars (400)', async () => {
    const res = await request(app).post('/signup').send({ ...VALID, password: 'ab1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 8/);
  });

  test('rejects password without a number (400)', async () => {
    const res = await request(app).post('/signup').send({ ...VALID, password: 'onlyletters' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/letter and one number/);
  });

  test('rejects missing required fields (400)', async () => {
    const res = await request(app).post('/signup').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate email (409)', async () => {
    await request(app).post('/signup').send(VALID);
    const res = await request(app).post('/signup').send(VALID);
    expect(res.status).toBe(409);
  });

  test('normalises email to lowercase + trimmed', async () => {
    const res = await request(app)
      .post('/signup')
      .send({ ...VALID, email: '  MixedCase@Test.com  ' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('mixedcase@test.com');
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/signup').send(VALID);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app).post('/login').send({ email: VALID.email, password: VALID.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  test('wrong password returns 401 with generic message', async () => {
    const res = await request(app).post('/login').send({ email: VALID.email, password: 'wrongpass1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('unknown email returns 401 with the same generic message', async () => {
    const res = await request(app).post('/login').send({ email: 'nobody@test.com', password: VALID.password });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('missing fields returns 400', async () => {
    const res = await request(app).post('/login').send({ email: VALID.email });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh', () => {
  test('exchanges a valid refresh token for new tokens', async () => {
    const signupRes = await request(app).post('/signup').send(VALID);
    const res = await request(app).post('/refresh').send({ refreshToken: signupRes.body.data.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  test('missing refresh token returns 400', async () => {
    const res = await request(app).post('/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('garbage refresh token returns 401', async () => {
    const res = await request(app).post('/refresh').send({ refreshToken: 'not.a.jwt' });
    expect(res.status).toBe(401);
  });
});

describe('auth rate limiter (10 per IP per 15 min)', () => {
  test('11th login attempt from the same IP returns 429', async () => {
    // First 10 attempts pass the limiter (they 401 on bad creds); the 11th is blocked.
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(limitedApp)
        .post('/auth/login')
        .send({ email: 'nobody@test.com', password: 'whatever1' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
