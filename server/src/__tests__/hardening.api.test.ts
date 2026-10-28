/**
 * Guards against abuse of bookings, slots, vehicle deletion and uploads.
 *
 *  - bookings: bad document type, service the centre doesn't offer, a centre booking itself
 *  - slots: duplicate / invalid / past creation
 *  - vehicles: can't be deleted while they carry fines, bookings or a transfer
 *  - uploads: only real images/PDFs, stored under a safe extension
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Provider } from '../models/Provider';
import { Slot } from '../models/Slot';
import { Booking } from '../models/Booking';
import { Challan } from '../models/Challan';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { generateAccessToken } from '../services/tokenService';

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
    [User, Vehicle, Provider, Slot, Booking, Challan, OwnershipTransfer].map((m) => (m as any).deleteMany({}))
  );
});

const auth = (user: any) =>
  `Bearer ${generateAccessToken({ userId: user._id.toString(), email: user.email, role: user.role })}`;

let counter = 0;
const makeUser = (role: 'owner' | 'provider') => {
  counter++;
  return User.create({
    name: `${role} ${counter}`,
    email: `${role}${counter}@test.com`,
    phone: `9900000${counter}`,
    passwordHash: 'x',
    role,
    address: { city: 'Delhi', state: 'Delhi', pincode: '110001' }
  });
};

const makeProvider = async (serviceTypes = ['puc']) => {
  const user = await makeUser('provider');
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
    regNumber: `DL1CAB${1000 + counter}`,
    type: 'car',
    fuelType: 'petrol',
    make: 'Maruti',
    model: 'Swift',
    year: 2020,
    qrCodeId: `qr-${counter}`
  });
};

const makeSlot = (provider: any) =>
  Slot.create({ providerId: provider._id, date: '2030-01-01', startTime: '09:00 AM', endTime: '10:00 AM', capacity: 2 });

describe('createBooking rules', () => {
  const book = (owner: any, vehicle: any, provider: any, slot: any, documentType: any) =>
    request(app)
      .post('/api/v1/bookings')
      .set('Authorization', auth(owner))
      .send({ vehicleId: vehicle._id, providerId: provider._id, slotId: slot._id, documentType });

  it('rejects an unknown document type without taking a seat', async () => {
    const { provider } = await makeProvider();
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await makeSlot(provider);

    const res = await book(owner, vehicle, provider, slot, 'banana');

    expect(res.status).toBe(400);
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it('rejects a document type that is not an expected string', async () => {
    const { provider } = await makeProvider();
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await makeSlot(provider);

    const res = await book(owner, vehicle, provider, slot, { $ne: 'puc' });

    expect(res.status).toBe(400);
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it("rejects a service the centre doesn't offer", async () => {
    const { provider } = await makeProvider(['puc']);
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await makeSlot(provider);

    const res = await book(owner, vehicle, provider, slot, 'insurance');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not offer INSURANCE/);
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it('accepts a service the centre offers', async () => {
    const { provider } = await makeProvider(['puc', 'insurance']);
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await makeSlot(provider);

    const res = await book(owner, vehicle, provider, slot, 'insurance');

    expect(res.status).toBe(201);
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(1);
  });

  it("refuses a centre booking its own vehicle", async () => {
    const { user: providerUser, provider } = await makeProvider();
    const vehicle = await makeVehicle(providerUser);
    const slot = await makeSlot(provider);

    const res = await book(providerUser, vehicle, provider, slot, 'puc');

    expect(res.status).toBe(403);
    expect((await Slot.findById(slot._id))!.bookedCount).toBe(0);
  });

  it('refuses to certify a booking made by the centre itself', async () => {
    const { user: providerUser, provider } = await makeProvider();
    const vehicle = await makeVehicle(providerUser);
    const slot = await makeSlot(provider);
    // A booking that predates the rule above
    const booking = await Booking.create({
      ownerId: providerUser._id, vehicleId: vehicle._id, providerId: provider._id,
      slotId: slot._id, documentType: 'puc', status: 'confirmed'
    });

    const res = await request(app)
      .patch(`/api/v1/bookings/${booking._id}/status`)
      .set('Authorization', auth(providerUser))
      .field('status', 'completed')
      .attach('certificate', Buffer.from('x'), { filename: 'c.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
    expect((await Booking.findById(booking._id))!.status).toBe('confirmed');
  });
});

describe('createSlots rules', () => {
  const create = (user: any, provider: any, slots: any[]) =>
    request(app).post(`/api/v1/providers/${provider._id}/slots`).set('Authorization', auth(user)).send({ slots });

  const slot = (startTime: string, date = '2030-02-01') => ({ date, startTime, endTime: '11:00 AM' });

  it('skips slots that already exist instead of doubling capacity', async () => {
    const { user, provider } = await makeProvider();

    const first = await create(user, provider, [slot('09:00 AM'), slot('10:00 AM')]);
    expect(first.status).toBe(201);
    expect(first.body.skipped).toBe(0);

    const again = await create(user, provider, [slot('09:00 AM'), slot('10:00 AM')]);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SLOTS_EXIST');

    const partial = await create(user, provider, [slot('10:00 AM'), slot('11:30 AM')]);
    expect(partial.status).toBe(201);
    expect(partial.body.data).toHaveLength(1);
    expect(partial.body.skipped).toBe(1);

    expect(await Slot.countDocuments({ providerId: provider._id })).toBe(3);
  });

  it('collapses duplicates inside one request', async () => {
    const { user, provider } = await makeProvider();
    const res = await create(user, provider, [slot('09:00 AM'), slot('09:00 AM')]);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
  });

  it.each([
    ['a malformed date', [{ date: '01/02/2030', startTime: '09:00 AM', endTime: '10:00 AM' }]],
    ['an impossible date', [{ date: '2030-13-45', startTime: '09:00 AM', endTime: '10:00 AM' }]],
    ['a past date', [{ date: '2001-01-01', startTime: '09:00 AM', endTime: '10:00 AM' }]],
    ['a missing time', [{ date: '2030-02-01', startTime: '', endTime: '10:00 AM' }]]
  ])('rejects %s', async (_label, slots) => {
    const { user, provider } = await makeProvider();
    const res = await create(user, provider, slots as any[]);
    expect(res.status).toBe(400);
    expect(await Slot.countDocuments({ providerId: provider._id })).toBe(0);
  });
});

describe('DELETE /vehicles/:id', () => {
  const remove = (owner: any, vehicle: any) =>
    request(app).delete(`/api/v1/vehicles/${vehicle._id}`).set('Authorization', auth(owner));

  it('deletes a clean vehicle', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await remove(owner, vehicle);

    expect(res.status).toBe(200);
    expect(await Vehicle.findById(vehicle._id)).toBeNull();
  });

  it('keeps a vehicle that has an e-challan, even a paid one', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    await Challan.create({ vehicleId: vehicle._id, amount: 1000, reason: 'PUC', status: 'paid', issuedAt: new Date() });

    const res = await remove(owner, vehicle);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VEHICLE_IN_USE');
    expect(await Vehicle.findById(vehicle._id)).not.toBeNull();
    expect(await Challan.countDocuments({ vehicleId: vehicle._id })).toBe(1);
  });

  it('keeps a vehicle with an active booking', async () => {
    const { provider } = await makeProvider();
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await makeSlot(provider);
    await Booking.create({
      ownerId: owner._id, vehicleId: vehicle._id, providerId: provider._id,
      slotId: slot._id, documentType: 'puc', status: 'pending'
    });

    const res = await remove(owner, vehicle);

    expect(res.status).toBe(409);
    expect(await Vehicle.findById(vehicle._id)).not.toBeNull();
  });

  it('keeps a vehicle with an ownership transfer in progress', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    await OwnershipTransfer.create({
      vehicleId: vehicle._id, fromOwnerId: owner._id, status: 'pending',
      expiresAt: new Date(Date.now() + 600000),
      snapshot: { score: 0, verifiedDocTypes: [], completedServiceCount: 0, violationCount: 0, ownershipIndex: 1 }
    });

    const res = await remove(owner, vehicle);

    expect(res.status).toBe(409);
    expect(await Vehicle.findById(vehicle._id)).not.toBeNull();
  });

  it('deletes a vehicle whose only bookings are finished', async () => {
    const { provider } = await makeProvider();
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);
    const slot = await makeSlot(provider);
    await Booking.create({
      ownerId: owner._id, vehicleId: vehicle._id, providerId: provider._id,
      slotId: slot._id, documentType: 'puc', status: 'cancelled'
    });

    expect((await remove(owner, vehicle)).status).toBe(200);
  });
});

describe('document uploads', () => {
  const stored: string[] = [];
  afterAll(() => {
    for (const f of stored) fs.rmSync(f, { force: true });
  });

  const upload = (owner: any, vehicle: any, filename: string, contentType: string) =>
    request(app)
      .post(`/api/v1/vehicles/${vehicle._id}/documents`)
      .set('Authorization', auth(owner))
      .field('type', 'puc')
      .field('issueDate', '2026-01-01')
      .field('expiryDate', '2027-01-01')
      .attach('file', Buffer.from('not really an image'), { filename, contentType });

  const remember = (fileUrl: string) => stored.push(path.join(process.cwd(), 'uploads', path.basename(fileUrl)));

  it('stores a real image under a safe extension', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await upload(owner, vehicle, 'photo.png', 'image/png');
    if (res.body.data?.fileUrl) remember(res.body.data.fileUrl);

    expect(res.status).toBe(201);
    expect(res.body.data.fileUrl).toMatch(/\.png$/);
  });

  it('accepts the image/jpg type the mobile app sends, and names it .jpg', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await upload(owner, vehicle, 'IMG_0001.JPG', 'image/jpg');
    if (res.body.data?.fileUrl) remember(res.body.data.fileUrl);

    expect(res.status).toBe(201);
    expect(res.body.data.fileUrl).toMatch(/\.jpg$/);
  });

  it('accepts a photo whose name has no extension', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await upload(owner, vehicle, '1000012345', 'image/jpeg');
    if (res.body.data?.fileUrl) remember(res.body.data.fileUrl);

    expect(res.status).toBe(201);
    expect(res.body.data.fileUrl).toMatch(/\.jpg$/);
  });

  it('never stores a web page, even when it claims to be an image', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await upload(owner, vehicle, 'evil.html', 'image/png');
    if (res.body.data?.fileUrl) remember(res.body.data.fileUrl);

    // Saved under the extension of the type it claimed, so it can only ever be served as an image
    expect(res.body.data?.fileUrl ?? '').not.toMatch(/\.html$/);
  });

  it('rejects a file of the wrong type with 400', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await upload(owner, vehicle, 'page.html', 'text/html');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only images/);
  });

  it('rejects an oversized file with 413', async () => {
    const owner = await makeUser('owner');
    const vehicle = await makeVehicle(owner);

    const res = await request(app)
      .post(`/api/v1/vehicles/${vehicle._id}/documents`)
      .set('Authorization', auth(owner))
      .field('type', 'puc')
      .field('issueDate', '2026-01-01')
      .field('expiryDate', '2027-01-01')
      .attach('file', Buffer.alloc(11 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(413);
  });
});
