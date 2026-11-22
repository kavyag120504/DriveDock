import request from 'supertest';
import { app } from '../index';
import { providers } from '../providers';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { sendPushNotification } from '../services/notificationService';
import { notifyUser } from '../services/notify';
import { setupTestDB, teardownTestDB, clearDB, makeOwner, makeUser, makeProvider, makeVehicle, authHeader } from './helpers';

const TOKEN = 'ExponentPushToken[test-device]';
let push: jest.SpyInstance;

beforeAll(setupTestDB);
beforeEach(() => { push = jest.spyOn(providers.push, 'send').mockResolvedValue(true); });
afterEach(async () => { push.mockRestore(); jest.restoreAllMocks(); await clearDB(); });
afterAll(teardownTestDB);

describe('notifyUser', () => {
  test('stores an inbox entry and sends a push when the device has a token', async () => {
    const owner = await makeOwner({ expoPushToken: TOKEN });
    expect(await notifyUser(owner._id, { title: 'Hello', body: 'World', kind: 'test', data: { vehicleId: 'v1' } })).toBe(true);
    const items = await Notification.find({ userId: owner._id }).lean();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Hello', body: 'World', kind: 'test', readAt: null });
    expect(push).toHaveBeenCalledWith({ to: TOKEN, title: 'Hello', body: 'World', data: { kind: 'test', vehicleId: 'v1' } });
  });

  test('without a push token it still lands in the inbox and reports no push', async () => {
    const owner = await makeOwner();
    expect(await notifyUser(owner._id, { title: 'Hi', body: 'there', kind: 'test' })).toBe(false);
    expect(await Notification.countDocuments({ userId: owner._id })).toBe(1);
    expect(push).not.toHaveBeenCalled();
  });

  test('never throws: a failing push or a missing user is reported as false', async () => {
    const owner = await makeOwner({ expoPushToken: TOKEN });
    push.mockRejectedValue(new Error('network down'));
    await expect(notifyUser(owner._id, { title: 'a', body: 'b', kind: 'test' })).resolves.toBe(false);
    await expect(notifyUser(null, { title: 'a', body: 'b', kind: 'test' })).resolves.toBe(false);
  });
});

describe('DeviceNotRegistered clean-up', () => {
  test('Expo reporting a dead device clears the stored token', async () => {
    const owner = await makeOwner({ expoPushToken: TOKEN });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ data: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } })
    } as unknown as Response);
    expect(await sendPushNotification({ to: TOKEN, title: 't', body: 'b' })).toBe(false);
    expect((await User.findById(owner._id).lean())!.expoPushToken).toBe('');
  });

  test('an accepted push leaves the token alone and asks for the Android channel', async () => {
    const owner = await makeOwner({ expoPushToken: TOKEN });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: { status: 'ok', id: 'x' } }) } as unknown as Response);
    expect(await sendPushNotification({ to: TOKEN, title: 't', body: 'b' })).toBe(true);
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as any).body)).toMatchObject({ channelId: 'default', priority: 'high' });
    expect((await User.findById(owner._id).lean())!.expoPushToken).toBe(TOKEN);
  });
});

describe('inbox API', () => {
  const seed = async (userId: any, n: number, kind = 'test') => {
    for (let i = 0; i < n; i++) await Notification.create({ userId, title: `T${i}`, body: `B${i}`, kind });
  };

  test('lists only my entries, newest first, with an unread count', async () => {
    const me = await makeOwner();
    const other = await makeOwner();
    await seed(me._id, 3);
    await seed(other._id, 2);
    const res = await request(app).get('/api/v1/notifications').set('Authorization', authHeader(me));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(3);
    expect(res.body.data.unreadCount).toBe(3);
    const times = res.body.data.items.map((i: any) => new Date(i.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test('marking read affects only my entries and can target specific ids', async () => {
    const me = await makeOwner();
    const other = await makeOwner();
    await seed(me._id, 2);
    await seed(other._id, 1);
    const mine = await Notification.find({ userId: me._id }).lean();
    const theirs = await Notification.findOne({ userId: other._id }).lean();

    const one = await request(app).post('/api/v1/notifications/read').set('Authorization', authHeader(me)).send({ ids: [String(mine[0]._id), String(theirs!._id)] });
    expect(one.status).toBe(200);
    expect(one.body.data.updated).toBe(1); // their entry is not mine to mark
    expect((await Notification.findById(theirs!._id).lean())!.readAt).toBeNull();

    const all = await request(app).post('/api/v1/notifications/read').set('Authorization', authHeader(me)).send({});
    expect(all.body.data.updated).toBe(1);
    const after = await request(app).get('/api/v1/notifications').set('Authorization', authHeader(me));
    expect(after.body.data.unreadCount).toBe(0);
  });

  test('bad ids are rejected and the inbox needs a login', async () => {
    const me = await makeOwner();
    expect((await request(app).post('/api/v1/notifications/read').set('Authorization', authHeader(me)).send({ ids: ['nope'] })).status).toBe(400);
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });
});

describe('events', () => {
  test('an officer logging a violation notifies the vehicle owner', async () => {
    const owner = await makeOwner({ expoPushToken: TOKEN });
    const officer = await makeUser('officer');
    const vehicle = await makeVehicle(owner._id.toString());
    const res = await request(app).post('/api/v1/violations').set('Authorization', authHeader(officer))
      .send({ vehicleId: String(vehicle._id), documentTypeExpired: ['insurance'], location: 'MG Road' });
    expect(res.status).toBe(201);
    const items = await Notification.find({ userId: owner._id, kind: 'challan_issued' }).lean();
    expect(items).toHaveLength(1);
    expect(items[0].body).toContain('INSURANCE');
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ to: TOKEN, data: expect.objectContaining({ kind: 'challan_issued' }) }));
  });

  test('an admin approving or suspending a station notifies its user; setting it back to pending does not', async () => {
    const admin = await makeUser('admin');
    const { user, provider } = await makeProvider('pending');
    const set = (status: string) => request(app).patch(`/api/v1/admin/providers/${provider._id}/status`).set('Authorization', authHeader(admin)).send({ status });
    expect((await set('approved')).status).toBe(200);
    expect((await set('suspended')).status).toBe(200);
    expect((await set('pending')).status).toBe(200);
    const kinds = (await Notification.find({ userId: user._id }).sort({ createdAt: 1 }).lean()).map((n) => n.title);
    expect(kinds).toEqual(['Station approved', 'Station suspended']);
  });
});
