/**
 * Reminders, rate limiting, payment integrity and officer citations.
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { rateLimiter } from '../middleware/rateLimiter';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Provider } from '../models/Provider';
import { Slot } from '../models/Slot';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { Reminder } from '../models/Reminder';
import { Challan } from '../models/Challan';
import { Violation } from '../models/Violation';
import { DocumentModel } from '../models/Document';
import { generateAccessToken } from '../services/tokenService';
import { generateTestSignature } from '../services/paymentService';
import { scheduleDocumentReminders } from '../services/reminderService';
import { runDueRemindersJob } from '../controllers/reminderController';

const app = express();
app.use(express.json());
app.use('/api/v1', mainRouter);
app.use(errorHandler);

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all(
    [User, Vehicle, Provider, Slot, Booking, Payment, Reminder, Challan, Violation, DocumentModel].map((m) =>
      (m as any).deleteMany({})
    )
  );
});

const DAY = 24 * 60 * 60 * 1000;

const auth = (user: any) =>
  `Bearer ${generateAccessToken({ userId: user._id.toString(), email: user.email, role: user.role })}`;

let counter = 0;
const makeUser = (role: 'owner' | 'provider' | 'officer') => {
  counter++;
  return User.create({
    name: `${role} ${counter}`,
    email: `${role}${counter}@test.com`,
    phone: `9910000${counter}`,
    passwordHash: 'x',
    role,
    address: { city: 'Delhi', state: 'Delhi', pincode: '110001' }
  });
};

const makeVehicle = (owner: any) => {
  counter++;
  return Vehicle.create({
    ownerId: owner._id,
    regNumber: `DL2CAB${1000 + counter}`,
    type: 'car',
    fuelType: 'petrol',
    make: 'Maruti',
    model: 'Swift',
    year: 2020,
    qrCodeId: `qr-r-${counter}`
  });
};

const makeDoc = (vehicle: any, type: string, overrides: Record<string, any> = {}) =>
  DocumentModel.create({
    vehicleId: vehicle._id,
    type,
    fileUrl: 'http://x/f.png',
    issueDate: new Date(Date.now() - 30 * DAY),
    expiryDate: new Date(Date.now() + 200 * DAY),
    status: 'valid',
    lastUpdatedBy: 'provider',
    verified: true,
    ...overrides
  });

describe('reminder scheduling', () => {
  const schedule = async (expiresInMs: number, verified = false) => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const doc = await makeDoc(vehicle, 'puc', { verified });
    const now = Date.now();
    await scheduleDocumentReminders(
      { documentId: doc._id, vehicleId: vehicle._id, ownerId: owner._id, expiryDate: new Date(now + expiresInMs), docType: 'puc', verified },
      now
    );
    return { doc, now, reminders: await Reminder.find({ documentId: doc._id }).sort({ scheduledFor: 1 }) };
  };

  it('schedules all three reminders ahead for a document with plenty of time', async () => {
    const { reminders, now } = await schedule(60 * DAY);
    expect(reminders.map((r) => r.thresholdDays)).toEqual([30, 7, 1]);
    expect(reminders.every((r) => r.scheduledFor.getTime() > now)).toBe(true);
  });

  it('sends one catch-up reminder, not a burst, when thresholds have already passed', async () => {
    const { reminders, now } = await schedule(5 * DAY);

    expect(reminders).toHaveLength(2);
    expect(reminders[0].scheduledFor.getTime()).toBeLessThanOrEqual(now);
    expect(reminders[0].message).toMatch(/expires in 5 day\(s\)/);
    expect(reminders[1].thresholdDays).toBe(1);
    expect(reminders[1].scheduledFor.getTime()).toBeGreaterThan(now);
  });

  it('sends a single "1 day" reminder for a document expiring within a day', async () => {
    const { reminders } = await schedule(12 * 60 * 60 * 1000);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].message).toMatch(/expires in 1 day\(s\)/);
  });

  it('words a verified document as a certificate', async () => {
    const { reminders } = await schedule(60 * DAY, true);
    expect(reminders[0].message).toMatch(/verified certificate/);
  });

  it('queues nothing for an expired document and clears its unsent reminders', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const doc = await makeDoc(vehicle, 'puc');
    const base = { documentId: doc._id, vehicleId: vehicle._id, ownerId: owner._id, docType: 'puc' as const, verified: false };
    await scheduleDocumentReminders({ ...base, expiryDate: new Date(Date.now() + 60 * DAY) });
    expect(await Reminder.countDocuments({ documentId: doc._id })).toBe(3);

    await scheduleDocumentReminders({ ...base, expiryDate: new Date(Date.now() - DAY) });
    expect(await Reminder.countDocuments({ documentId: doc._id })).toBe(0);
  });

  it('keeps reminders that were already sent', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const doc = await makeDoc(vehicle, 'puc');
    await Reminder.create({
      documentId: doc._id, vehicleId: vehicle._id, ownerId: owner._id, scheduledFor: new Date(Date.now() - DAY),
      thresholdDays: 30, message: 'old', sent: true, sentAt: new Date()
    });

    await scheduleDocumentReminders({
      documentId: doc._id, vehicleId: vehicle._id, ownerId: owner._id,
      expiryDate: new Date(Date.now() + 60 * DAY), docType: 'puc', verified: false
    });

    expect(await Reminder.countDocuments({ documentId: doc._id, sent: true })).toBe(1);
  });

  it('reschedules when the owner edits the expiry date', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const doc = await makeDoc(vehicle, 'puc', { verified: false, expiryDate: new Date(Date.now() + 90 * DAY) });
    await Reminder.create({
      documentId: doc._id, vehicleId: vehicle._id, ownerId: owner._id,
      scheduledFor: new Date(Date.now() + 60 * DAY), thresholdDays: 30, message: 'stale', sent: false
    });

    const newExpiry = new Date(Date.now() + 120 * DAY);
    const res = await request(app)
      .patch(`/api/v1/documents/${doc._id}`)
      .set('Authorization', auth(owner))
      .send({ expiryDate: newExpiry.toISOString() });

    expect(res.status).toBe(200);
    const reminders = await Reminder.find({ documentId: doc._id }).sort({ thresholdDays: -1 });
    expect(reminders.map((r) => r.thresholdDays)).toEqual([30, 7, 1]);
    expect(reminders[0].scheduledFor.getTime()).toBe(newExpiry.getTime() - 30 * DAY);
    expect(reminders.some((r) => r.message === 'stale')).toBe(false);
  });
});

describe('daily job marks documents expiring soon', () => {
  it('moves valid documents inside 30 days to expiring_soon and leaves the rest alone', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const soon = await makeDoc(vehicle, 'puc', { expiryDate: new Date(Date.now() + 10 * DAY) });
    const later = await makeDoc(vehicle, 'insurance', { expiryDate: new Date(Date.now() + 90 * DAY) });
    const gone = await makeDoc(vehicle, 'rc', { expiryDate: new Date(Date.now() - DAY) });

    await runDueRemindersJob();

    expect((await DocumentModel.findById(soon._id))!.status).toBe('expiring_soon');
    expect((await DocumentModel.findById(later._id))!.status).toBe('valid');
    expect((await DocumentModel.findById(gone._id))!.status).toBe('expired');
  });
});

describe('rate limiter', () => {
  const build = () => {
    const a = express();
    a.use(express.json());
    a.post('/login', rateLimiter(3, 60000, { countFailuresOnly: true }), (req, res) => {
      res.status(req.body.ok ? 200 : 401).json({});
    });
    a.post('/signup', rateLimiter(3, 60000), (_req, res) => res.status(201).json({}));
    return a;
  };

  it('never counts successful logins', async () => {
    const a = build();
    for (let i = 0; i < 8; i++) {
      expect((await request(a).post('/login').send({ ok: true })).status).toBe(200);
    }
  });

  it('blocks after the allowed number of failed logins', async () => {
    const a = build();
    for (let i = 0; i < 3; i++) {
      expect((await request(a).post('/login').send({ ok: false })).status).toBe(401);
    }
    const blocked = await request(a).post('/login').send({ ok: true });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('keeps login and signup allowances separate', async () => {
    const a = build();
    for (let i = 0; i < 3; i++) await request(a).post('/login').send({ ok: false });
    expect((await request(a).post('/login').send({ ok: false })).status).toBe(429);

    expect((await request(a).post('/signup')).status).toBe(201);
  });

  it('limits every sign-up attempt', async () => {
    const a = build();
    for (let i = 0; i < 3; i++) expect((await request(a).post('/signup')).status).toBe(201);
    expect((await request(a).post('/signup')).status).toBe(429);
  });
});

describe('payment integrity', () => {
  const setup = async () => {
    const providerUser = await makeUser('provider');
    const provider = await Provider.create({
      userId: providerUser._id, businessName: 'Pay Centre', serviceTypes: ['puc'],
      location: { type: 'Point', coordinates: [77.2, 28.6] }, address: 'Connaught Place, Delhi', status: 'approved'
    });
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await Slot.create({ providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM' });

    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', auth(owner))
      .send({ vehicleId: vehicle._id, providerId: provider._id, slotId: slot._id, documentType: 'puc' });
    const bookingId = booked.body.data.booking._id;

    const order = await request(app).post('/api/v1/payments/create-order').set('Authorization', auth(owner)).send({ bookingId });
    const { orderId, testSignatureHelper } = order.body.data;

    const verify = (paymentId: string, signature: string) =>
      request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', auth(owner))
        .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature, bookingId });

    return { orderId, testSignatureHelper, verify, bookingId };
  };

  it('a bad signature marks an unpaid order failed', async () => {
    const { orderId, verify } = await setup();

    expect((await verify('pay_x', 'deadbeef')).status).toBe(400);

    expect((await Payment.findOne({ razorpayOrderId: orderId }))!.status).toBe('failed');
  });

  it('a bad signature can never downgrade a payment that went through', async () => {
    const { orderId, verify, bookingId } = await setup();
    const goodId = 'pay_real_1';
    expect((await verify(goodId, generateTestSignature(orderId, goodId))).status).toBe(200);

    const bad = await verify(goodId, 'deadbeef');
    expect(bad.status).toBe(400);

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    expect(payment!.status).toBe('paid');
    expect(payment!.razorpayPaymentId).toBe(goodId);
    expect((await Booking.findById(bookingId))!.status).toBe('confirmed');
  });

  it('a second valid verification keeps the first payment id', async () => {
    const { orderId, verify } = await setup();
    await verify('pay_first', generateTestSignature(orderId, 'pay_first'));

    const again = await verify('pay_second', generateTestSignature(orderId, 'pay_second'));

    expect(again.status).toBe(200);
    expect((await Payment.findOne({ razorpayOrderId: orderId }))!.razorpayPaymentId).toBe('pay_first');
  });
});

describe('officer citations', () => {
  const cite = (officer: any, body: Record<string, any>) =>
    request(app).post('/api/v1/violations').set('Authorization', auth(officer)).send({ location: 'Ring Road checkpoint', ...body });

  it('refuses to cite a document that is verified and valid', async () => {
    const officer = await makeUser('officer');
    const vehicle = await makeVehicle(await makeUser('owner'));
    await makeDoc(vehicle, 'puc');

    const res = await cite(officer, { vehicleId: vehicle._id, documentTypeExpired: ['PUC'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PUC is verified and valid/);
    expect(await Challan.countDocuments({ vehicleId: vehicle._id })).toBe(0);
  });

  it('cites a missing document, accepts capitals, and stores lowercase types', async () => {
    const officer = await makeUser('officer');
    const vehicle = await makeVehicle(await makeUser('owner'));

    const res = await cite(officer, { vehicleId: vehicle._id, documentTypeExpired: ['INSURANCE', 'insurance'] });

    expect(res.status).toBe(201);
    expect(res.body.data.challan.amount).toBe(2000); // duplicates in the request are counted once
    expect(res.body.data.violation.documentTypeExpired).toEqual(['insurance']);
  });

  it('cites a certified document that has since expired or an unverified one', async () => {
    const officer = await makeUser('officer');
    const vehicle = await makeVehicle(await makeUser('owner'));
    await makeDoc(vehicle, 'puc', { expiryDate: new Date(Date.now() - DAY), status: 'expired' });
    await makeDoc(vehicle, 'rc', { verified: false });

    const res = await cite(officer, { vehicleId: vehicle._id, documentTypeExpired: ['puc', 'rc'] });

    expect(res.status).toBe(201);
    expect(res.body.data.challan.amount).toBe(1000 + 5000);
  });

  it.each([
    ['an unknown type', { documentTypeExpired: ['puc', 'banana'] }],
    ['an empty list', { documentTypeExpired: [] }],
    ['a non-text type', { documentTypeExpired: [123] }],
    ['a blank location', { documentTypeExpired: ['puc'], location: '   ' }],
    ['a malformed vehicle id', { vehicleId: 'not-an-id', documentTypeExpired: ['puc'] }]
  ])('rejects %s with 400, not 500', async (_label, body) => {
    const officer = await makeUser('officer');
    const vehicle = await makeVehicle(await makeUser('owner'));

    const res = await cite(officer, { vehicleId: vehicle._id, ...body });

    expect(res.status).toBe(400);
    expect(await Challan.countDocuments({})).toBe(0);
  });
});
