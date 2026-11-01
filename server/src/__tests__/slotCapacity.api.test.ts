/**
 * Centre capacity: a slot can hold as many concurrent bookings as the centre has bays.
 *
 *  - PATCH /providers/me saves the centre profile (capacity, address, location)
 *  - slots take their capacity from the centre
 *  - parallel bookings never exceed capacity
 *  - cancelling frees exactly one seat
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Provider } from '../models/Provider';
import { Slot } from '../models/Slot';
import { Booking } from '../models/Booking';
import { generateAccessToken } from '../services/tokenService';
import { reserveSeat, releaseSeat } from '../services/slotService';

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
  await Promise.all([User, Vehicle, Provider, Slot, Booking].map((m) => (m as any).deleteMany({})));
});

const auth = (user: any) =>
  `Bearer ${generateAccessToken({ userId: user._id.toString(), email: user.email, role: user.role })}`;

const makeUser = (role: 'owner' | 'provider', n: number) =>
  User.create({
    name: `${role} ${n}`,
    email: `${role}${n}@test.com`,
    phone: `99000000${n}`,
    passwordHash: 'x',
    role,
    address: { city: 'Delhi', state: 'Delhi', pincode: '110001' }
  });

const makeProvider = async (capacity?: number) => {
  const user = await makeUser('provider', 1);
  const provider = await Provider.create({
    userId: user._id,
    businessName: 'Test Centre',
    location: { type: 'Point', coordinates: [77.2, 28.6] },
    address: 'Connaught Place, Delhi',
    status: 'approved',
    profileCompleted: false,
    ...(capacity ? { capacity } : {})
  });
  return { user, provider };
};

const makeVehicle = async (owner: any, n: number) =>
  Vehicle.create({
    ownerId: owner._id,
    regNumber: `DL1CAB${1000 + n}`,
    type: 'car',
    fuelType: 'petrol',
    make: 'Maruti',
    model: 'Swift',
    year: 2020,
    qrCodeId: `qr-${n}`
  });

describe('PATCH /providers/me', () => {
  it('saves capacity and marks the profile completed', async () => {
    const { user } = await makeProvider();

    const res = await request(app)
      .patch('/api/v1/providers/me')
      .set('Authorization', auth(user))
      .send({
        businessName: 'Metro PUC Centre',
        address: '12 Ring Road, Gurugram',
        coordinates: [77.03, 28.45],
        serviceTypes: ['puc', 'fitness'],
        capacity: 4
      });

    expect(res.status).toBe(200);
    expect(res.body.data.capacity).toBe(4);
    expect(res.body.data.profileCompleted).toBe(true);
    expect(res.body.data.location.coordinates).toEqual([77.03, 28.45]);
    expect(res.body.data.status).toBe('approved'); // never changed by the provider
  });

  it.each([[0], [51], [2.5], ['abc']])('rejects capacity %p', async (capacity) => {
    const { user } = await makeProvider();
    const res = await request(app)
      .patch('/api/v1/providers/me')
      .set('Authorization', auth(user))
      .send({ capacity });
    expect(res.status).toBe(400);
  });

  it('rejects unknown service types and bad coordinates', async () => {
    const { user } = await makeProvider();
    const bad1 = await request(app).patch('/api/v1/providers/me').set('Authorization', auth(user)).send({ serviceTypes: ['rocket'] });
    const bad2 = await request(app).patch('/api/v1/providers/me').set('Authorization', auth(user)).send({ coordinates: [500, 20] });
    expect(bad1.status).toBe(400);
    expect(bad2.status).toBe(400);
  });

  it('is refused for non-providers', async () => {
    const owner = await makeUser('owner', 2);
    const res = await request(app).patch('/api/v1/providers/me').set('Authorization', auth(owner)).send({ capacity: 3 });
    expect(res.status).toBe(403);
  });
});

describe('slot capacity', () => {
  it('slots default to the centre capacity and can be overridden', async () => {
    const { user, provider } = await makeProvider(3);

    const res = await request(app)
      .post(`/api/v1/providers/${provider._id}/slots`)
      .set('Authorization', auth(user))
      .send({
        slots: [
          { date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM' },
          { date: '2030-01-01', startTime: '10:30 AM', endTime: '11:30 AM', capacity: 1 }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.data.map((s: any) => s.capacity)).toEqual([3, 1]);
    expect(res.body.data.every((s: any) => s.bookedCount === 0 && s.isBooked === false)).toBe(true);
  });

  it('fills up at exactly capacity, even under parallel requests', async () => {
    const { provider } = await makeProvider(3);
    const slot = await Slot.create({
      providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', capacity: 3
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveSeat({ _id: slot._id }))
    );

    expect(results.filter(Boolean)).toHaveLength(3);
    const after = await Slot.findById(slot._id);
    expect(after!.bookedCount).toBe(3);
    expect(after!.isBooked).toBe(true);
  });

  it('releasing a seat reopens the slot and never goes below zero', async () => {
    const { provider } = await makeProvider(2);
    const slot = await Slot.create({
      providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', capacity: 2
    });

    await reserveSeat({ _id: slot._id });
    await reserveSeat({ _id: slot._id });
    expect((await Slot.findById(slot._id))!.isBooked).toBe(true);

    await releaseSeat(slot._id);
    const reopened = await Slot.findById(slot._id);
    expect(reopened!.bookedCount).toBe(1);
    expect(reopened!.isBooked).toBe(false);

    await releaseSeat(slot._id);
    await releaseSeat(slot._id);
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it('treats a legacy slot (no capacity fields) as capacity 1', async () => {
    const { provider } = await makeProvider();
    const { insertedId } = await Slot.collection.insertOne({
      providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', isBooked: false
    });

    expect(await reserveSeat({ _id: insertedId })).not.toBeNull();
    expect(await reserveSeat({ _id: insertedId })).toBeNull();
    await releaseSeat(insertedId);
    expect(await reserveSeat({ _id: insertedId })).not.toBeNull();
  });

  it('a seeded slot created already booked is full', async () => {
    const { provider } = await makeProvider();
    const slot = await Slot.create({
      providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', isBooked: true
    });
    expect(slot.bookedCount).toBe(1);
    expect(await reserveSeat({ _id: slot._id })).toBeNull();
  });
});

describe('cancelling the same booking twice at once', () => {
  it('frees exactly one seat', async () => {
    const { user: providerUser, provider } = await makeProvider(2);
    const slot = await Slot.create({
      providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', capacity: 2
    });
    const owners = await Promise.all([1, 2].map((n) => makeUser('owner', n)));
    const vehicles = await Promise.all(owners.map((o, i) => makeVehicle(o, i)));
    const bookings = await Promise.all(
      owners.map((o, i) =>
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', auth(o))
          .send({ vehicleId: vehicles[i]._id, providerId: provider._id, slotId: slot._id, documentType: 'puc' })
      )
    );
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(2);

    const cancel = () =>
      request(app)
        .patch(`/api/v1/bookings/${bookings[0].body.data.booking._id}/status`)
        .set('Authorization', auth(providerUser))
        .send({ status: 'cancelled' });
    const results = await Promise.all([cancel(), cancel(), cancel()]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const after = await Slot.findById(slot._id);
    expect(after!.bookedCount).toBe(1); // the other owner's booking still holds its seat
    expect(after!.isBooked).toBe(false);
  });
});

describe('booking API with a multi-bay centre', () => {
  it('lets 2 owners book a 2-bay slot, rejects the 3rd, and a cancel frees one seat', async () => {
    const { user: providerUser, provider } = await makeProvider(2);
    const slot = await Slot.create({
      providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', capacity: 2
    });

    const owners = await Promise.all([1, 2, 3].map((n) => makeUser('owner', n)));
    const vehicles = await Promise.all(owners.map((o, i) => makeVehicle(o, i)));

    const book = (i: number) =>
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', auth(owners[i]))
        .send({ vehicleId: vehicles[i]._id, providerId: provider._id, slotId: slot._id, documentType: 'puc' });

    const first = await book(0);
    const second = await book(1);
    const third = await book(2);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(409);

    // Station search hides the slot while full
    const full = await request(app).get(`/api/v1/stations/${provider._id}/slots`).set('Authorization', auth(owners[0]));
    expect(full.body.data).toHaveLength(0);

    const cancel = await request(app)
      .patch(`/api/v1/bookings/${first.body.data.booking._id}/status`)
      .set('Authorization', auth(providerUser))
      .send({ status: 'cancelled' });
    expect(cancel.status).toBe(200);

    const open = await request(app).get(`/api/v1/stations/${provider._id}/slots`).set('Authorization', auth(owners[0]));
    expect(open.body.data).toHaveLength(1);
    expect(open.body.data[0].bookedCount).toBe(1);

    expect((await book(2)).status).toBe(201);
  });
});
