/**
 * Phase 2 hardening: front-door request-body validation (middleware/validate.ts +
 * validators/) and explicit request size limits (express.json limit → 413).
 *
 * These pin the NEW behaviour:
 *  - a malformed/wrongly-typed body is rejected with 400 and an `errors` map BEFORE
 *    the controller runs (and, for bookings, before any slot seat is taken);
 *  - a well-formed body still reaches the controller unchanged, so business rules
 *    and their exact messages are untouched;
 *  - a body over REQUEST_BODY_LIMIT returns 413.
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Provider } from '../models/Provider';
import { Slot } from '../models/Slot';
import { Booking } from '../models/Booking';
import { generateAccessToken } from '../services/tokenService';

// Mirrors the production wiring: an explicit 1kb JSON limit so an oversized body is
// easy to trigger in a test, then the API router, then the shared error handler.
const app = express();
app.use(express.json({ limit: '1kb' }));
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
    [User, Vehicle, Provider, Slot, Booking].map((m) => (m as any).deleteMany({}))
  );
});

const auth = (user: any) =>
  `Bearer ${generateAccessToken({ userId: user._id.toString(), email: user.email, role: user.role })}`;

let counter = 0;
const makeOwner = () => {
  counter++;
  return User.create({
    name: `owner ${counter}`,
    email: `owner${counter}@test.com`,
    phone: `9900000${counter}`,
    passwordHash: 'x',
    role: 'owner',
    address: { city: 'Delhi', state: 'Delhi', pincode: '110001' }
  });
};

const makeProvider = async (serviceTypes = ['puc']) => {
  counter++;
  const user = await User.create({
    name: `prov ${counter}`,
    email: `prov${counter}@test.com`,
    phone: `9911000${counter}`,
    passwordHash: 'x',
    role: 'provider',
    address: { city: 'Delhi', state: 'Delhi', pincode: '110001' }
  });
  const provider = await Provider.create({
    userId: user._id,
    businessName: 'Test Centre',
    serviceTypes,
    location: { type: 'Point', coordinates: [77.2, 28.6] },
    address: 'Connaught Place, Delhi',
    status: 'approved',
    capacity: 2
  });
  return { user, provider };
};

const makeVehicle = (owner: any) => {
  counter++;
  return Vehicle.create({
    ownerId: owner._id,
    regNumber: `DL9CZZ${1000 + counter}`,
    type: 'car',
    fuelType: 'petrol',
    make: 'Maruti',
    model: 'Swift',
    year: 2020,
    qrCodeId: `DD-VAL${counter}`,
    region: { state: 'Delhi', district: 'Delhi' }
  });
};

describe('request validation middleware', () => {
  it('rejects a booking with a missing field (400 + errors map) before taking a seat', async () => {
    const owner = await makeOwner();
    const { provider } = await makeProvider(['puc']);
    const slot = await Slot.create({ providerId: provider._id, date: '2099-01-01', startTime: '10:00', endTime: '11:00' });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', auth(owner))
      // slotId omitted
      .send({ vehicleId: 'x', providerId: String(provider._id), documentType: 'puc' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.slotId).toBeDefined();
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it('rejects a non-string documentType (NoSQL-operator shape) at the front door', async () => {
    const owner = await makeOwner();
    const { provider } = await makeProvider(['puc']);
    const slot = await Slot.create({ providerId: provider._id, date: '2099-01-01', startTime: '10:00', endTime: '11:00' });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', auth(owner))
      .send({ vehicleId: String((await makeVehicle(owner))._id), providerId: String(provider._id), slotId: String(slot._id), documentType: { $ne: 'puc' } });

    expect(res.status).toBe(400);
    expect(res.body.errors.documentType).toBeDefined();
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it('lets a well-formed body through so the controller rules still decide', async () => {
    const owner = await makeOwner();
    const { provider } = await makeProvider(['puc']); // offers PUC, not insurance
    const vehicle = await makeVehicle(owner);
    const slot = await Slot.create({ providerId: provider._id, date: '2099-01-01', startTime: '10:00', endTime: '11:00' });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', auth(owner))
      .send({ vehicleId: String(vehicle._id), providerId: String(provider._id), slotId: String(slot._id), documentType: 'insurance' });

    // Passes validation, then the controller's business rule rejects it.
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not offer INSURANCE/);
  });

  it('rejects a payment verify with a non-string signature (400)', async () => {
    const owner = await makeOwner();
    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', auth(owner))
      .send({ razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: { $gt: '' } });

    expect(res.status).toBe(400);
    expect(res.body.errors.razorpaySignature).toBeDefined();
  });
});

describe('validate() unit behaviour', () => {
  const { z } = require('zod');
  const schema = z.object({ a: z.string() });
  const run = (body: any) => {
    const mw = validate({ body: schema });
    const req: any = { body };
    let status = 0;
    let payload: any;
    const res: any = { status: (s: number) => { status = s; return res; }, json: (p: any) => { payload = p; } };
    let nexted = false;
    mw(req, res, () => { nexted = true; });
    return { status, payload, nexted };
  };

  it('calls next() on a valid body and never touches the response', () => {
    const r = run({ a: 'ok', extra: 'kept' });
    expect(r.nexted).toBe(true);
    expect(r.status).toBe(0);
  });

  it('responds 400 with a field-keyed errors map on an invalid body', () => {
    const r = run({ a: 123 });
    expect(r.nexted).toBe(false);
    expect(r.status).toBe(400);
    expect(r.payload.success).toBe(false);
    expect(r.payload.errors.a).toBeDefined();
  });
});

describe('request size limit', () => {
  it('returns 413 for a body larger than the configured limit', async () => {
    const owner = await makeOwner();
    const big = 'x'.repeat(5000); // > 1kb limit configured above

    const res = await request(app)
      .post('/api/v1/vehicles')
      .set('Authorization', auth(owner))
      .send({ regNumber: 'DL1CAB0001', make: 'Maruti', model: 'Swift', year: 2020, note: big });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/too large/i);
  });
});
