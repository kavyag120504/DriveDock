import request from 'supertest';
import { ENV } from '../config/env';
import { app } from '../index';
import { providers } from '../providers';
import { PasswordReset } from '../models/PasswordReset';
import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { setupTestDB, teardownTestDB, clearDB, makeOwner } from './helpers';

// The IP limiter is shared by every request in this file; its own behaviour is covered elsewhere.
jest.mock('../middleware/rateLimiter', () => ({
  rateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ipKey: () => 'test',
  userKey: () => 'test'
}));

let emailSend: jest.SpyInstance;
let smsSend: jest.SpyInstance;
const original = { devCode: ENV.RESET_CODE_IN_RESPONSE };

beforeAll(setupTestDB);
beforeEach(() => {
  emailSend = jest.spyOn(providers.email, 'send').mockResolvedValue(true);
  smsSend = jest.spyOn(providers.sms, 'send').mockResolvedValue(true);
  ENV.RESET_CODE_IN_RESPONSE = false;
});
afterEach(async () => { jest.restoreAllMocks(); await clearDB(); });
afterAll(async () => { ENV.RESET_CODE_IN_RESPONSE = original.devCode; await teardownTestDB(); });

const codeFromEmail = (): string => /code is (\d{6})/.exec(emailSend.mock.calls[0][2])![1];

const forgot = (body: Record<string, unknown>) => request(app).post('/api/v1/auth/forgot-password').send(body);
const reset = (body: Record<string, unknown>) => request(app).post('/api/v1/auth/reset-password').send(body);

describe('forgot password', () => {
  test('emails a 6-digit code and stores only a hash of it', async () => {
    const owner = await makeOwner({ email: 'reset.me@test.com' });
    const res = await forgot({ identifier: 'Reset.Me@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.devCode).toBeUndefined();

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(emailSend.mock.calls[0][0]).toBe('reset.me@test.com');
    const code = codeFromEmail();
    const row = await PasswordReset.findOne({ userId: owner._id }).lean();
    expect(row!.codeHash).not.toContain(code);
    expect(row!.codeHash).toHaveLength(64);
  });

  test('a mobile number sends an SMS to +91 and the last 10 digits are enough to find the account', async () => {
    await makeOwner({ phone: '+91 98765 43210' });
    const res = await forgot({ identifier: '9876543210' });
    expect(res.status).toBe(200);
    expect(smsSend).toHaveBeenCalledWith('+919876543210', 'password_reset', expect.objectContaining({ code: expect.stringMatching(/^\d{6}$/) }));
    expect(emailSend).not.toHaveBeenCalled();
  });

  test('an email identifier can still ask for the SMS', async () => {
    await makeOwner({ email: 'both@test.com', phone: '9123456780' });
    await forgot({ identifier: 'both@test.com', channel: 'sms' });
    expect(smsSend).toHaveBeenCalledTimes(1);
    expect(emailSend).not.toHaveBeenCalled();
  });

  test('gives the same answer for an unknown account and sends nothing', async () => {
    await makeOwner({ email: 'real@test.com' });
    const known = await forgot({ identifier: 'real@test.com' });
    const unknown = await forgot({ identifier: 'nobody@test.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(emailSend).toHaveBeenCalledTimes(1);
  });

  test('a number shared by two accounts gets no code', async () => {
    await makeOwner({ phone: '9000000001' });
    await makeOwner({ phone: '9000000001' });
    const res = await forgot({ identifier: '9000000001' });
    expect(res.status).toBe(200);
    expect(smsSend).not.toHaveBeenCalled();
  });

  test('a second request inside a minute does not send another code', async () => {
    await makeOwner({ email: 'twice@test.com' });
    await forgot({ identifier: 'twice@test.com' });
    await forgot({ identifier: 'twice@test.com' });
    expect(emailSend).toHaveBeenCalledTimes(1);
  });

  test('a failing mail provider still answers 200', async () => {
    await makeOwner({ email: 'down@test.com' });
    emailSend.mockRejectedValue(new Error('smtp down'));
    expect((await forgot({ identifier: 'down@test.com' })).status).toBe(200);
  });

  test('the code is returned only when the pilot flag is on', async () => {
    await makeOwner({ email: 'pilot@test.com' });
    ENV.RESET_CODE_IN_RESPONSE = true;
    const res = await forgot({ identifier: 'pilot@test.com' });
    expect(res.body.devCode).toMatch(/^\d{6}$/);
  });

  test('rejects a body with no identifier', async () => {
    expect((await forgot({})).status).toBe(400);
  });
});

describe('reset password', () => {
  const setup = async () => {
    const owner = await makeOwner({ email: 'owner.reset@test.com', password: 'oldpass123' });
    await forgot({ identifier: 'owner.reset@test.com' });
    return { owner, code: codeFromEmail() };
  };

  test('the right code sets the new password, signs out every session and cannot be used twice', async () => {
    const { owner, code } = await setup();
    // an existing login
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'owner.reset@test.com', password: 'oldpass123' });
    expect(login.status).toBe(200);
    expect(await RefreshToken.countDocuments({ userId: owner._id, revokedAt: null })).toBeGreaterThan(0);

    const res = await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'newpass456' });
    expect(res.status).toBe(200);

    expect((await request(app).post('/api/v1/auth/login').send({ email: 'owner.reset@test.com', password: 'oldpass123' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'owner.reset@test.com', password: 'newpass456' })).status).toBe(200);
    expect(await PasswordReset.countDocuments({ userId: owner._id })).toBe(0);

    // the old refresh token no longer works
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.data.refreshToken });
    expect(refresh.status).toBe(401);

    expect((await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'another789' })).status).toBe(400);
  });

  test('a wrong code is refused and the password stays the same', async () => {
    const { code } = await setup();
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await reset({ identifier: 'owner.reset@test.com', code: wrong, newPassword: 'newpass456' });
    expect(res.status).toBe(400);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'owner.reset@test.com', password: 'oldpass123' })).status).toBe(200);
  });

  test('five wrong guesses lock the code, even the right one', async () => {
    const { code } = await setup();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await reset({ identifier: 'owner.reset@test.com', code: wrong, newPassword: 'newpass456' });
    }
    const res = await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'newpass456' });
    expect(res.status).toBe(400);
  });

  test('an expired code is refused', async () => {
    const { owner, code } = await setup();
    await PasswordReset.updateOne({ userId: owner._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'newpass456' })).status).toBe(400);
  });

  test('a new request replaces the older code', async () => {
    const { owner, code } = await setup();
    // createdAt is immutable in Mongoose, so age the row through the raw collection
    await PasswordReset.collection.updateOne({ userId: owner._id }, { $set: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });
    await forgot({ identifier: 'owner.reset@test.com' });
    expect(emailSend).toHaveBeenCalledTimes(2);
    const newer = /code is (\d{6})/.exec(emailSend.mock.calls[1][2])![1];
    if (newer !== code) {
      expect((await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'newpass456' })).status).toBe(400);
    }
    expect((await reset({ identifier: 'owner.reset@test.com', code: newer, newPassword: 'newpass456' })).status).toBe(200);
  });

  test('the new password has to follow the signup rules, and a refusal does not burn the code', async () => {
    const { code } = await setup();
    expect((await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'short1' })).status).toBe(400);
    expect((await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'onlyletters' })).status).toBe(400);
    expect((await reset({ identifier: 'owner.reset@test.com', code, newPassword: 'goodpass123' })).status).toBe(200);
  });

  test('an unknown account gets the same refusal as a wrong code', async () => {
    const res = await reset({ identifier: 'ghost@test.com', code: '123456', newPassword: 'newpass456' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not valid or has expired/);
  });

  test('one account cannot use the code of another', async () => {
    const { code } = await setup();
    await makeOwner({ email: 'other@test.com', password: 'otherpass1' });
    const res = await reset({ identifier: 'other@test.com', code, newPassword: 'hijacked123' });
    expect(res.status).toBe(400);
    expect((await User.findOne({ email: 'other@test.com' }))!.comparePassword('otherpass1')).resolves.toBe(true);
  });
});
