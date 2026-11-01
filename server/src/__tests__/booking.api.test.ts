/**
 * Characterization tests for booking: atomic slot claim (Trust Rule 5) and
 * provider completion setting verified:true (Trust Rule 1).
 */

import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

import bookingRoutes from '../routes/bookingRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { Booking } from '../models/Booking';
import { Slot } from '../models/Slot';
import { DocumentModel } from '../models/Document';
import { Reminder } from '../models/Reminder';
import {
  setupTestDB,
  teardownTestDB,
  clearDB,
  makeOwner,
  makeProvider,
  makeVehicle,
  makeSlot,
  authHeader
} from './helpers';

const app = express();
app.use(express.json());
app.use('/bookings', bookingRoutes);
app.use(errorHandler);

// The local-storage upload path leaves the uploaded certificate on disk. Snapshot the
// uploads folder before the suite and remove anything new afterwards, so tests don't
// pollute the repo.
const uploadsDir = path.join(process.cwd(), 'uploads');
let preexisting: Set<string>;

beforeAll(async () => {
  await setupTestDB();
  preexisting = new Set(fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []);
});

afterAll(async () => {
  await teardownTestDB();
  if (fs.existsSync(uploadsDir)) {
    for (const f of fs.readdirSync(uploadsDir)) {
      if (!preexisting.has(f)) fs.unlinkSync(path.join(uploadsDir, f));
    }
  }
});

afterEach(clearDB);

describe('POST /bookings — create', () => {
  test('requires vehicleId, providerId, slotId, documentType (400)', async () => {
    const owner = await makeOwner();
    const res = await request(app).post('/bookings').set('Authorization', authHeader(owner)).send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 when the vehicle is not the caller’s', async () => {
    const owner = await makeOwner();
    const other = await makeOwner();
    const { provider } = await makeProvider('approved');
    const vehicle = await makeVehicle(other._id.toString());
    const slot = await makeSlot(provider._id.toString());

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', authHeader(owner))
      .send({ vehicleId: vehicle._id, providerId: provider._id, slotId: slot._id, documentType: 'puc' });

    expect(res.status).toBe(404);
  });

  test('returns 400 when the provider is not approved', async () => {
    const owner = await makeOwner();
    const { provider } = await makeProvider('pending');
    const vehicle = await makeVehicle(owner._id.toString());
    const slot = await makeSlot(provider._id.toString());

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', authHeader(owner))
      .send({ vehicleId: vehicle._id, providerId: provider._id, slotId: slot._id, documentType: 'puc' });

    expect(res.status).toBe(400);
  });

  test('happy path: 201, booking pending, slot becomes booked', async () => {
    const owner = await makeOwner();
    const { provider } = await makeProvider('approved');
    const vehicle = await makeVehicle(owner._id.toString());
    const slot = await makeSlot(provider._id.toString());

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', authHeader(owner))
      .send({ vehicleId: vehicle._id, providerId: provider._id, slotId: slot._id, documentType: 'puc' });

    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('pending');
    const refreshed = await Slot.findById(slot._id);
    expect(refreshed!.isBooked).toBe(true);
  });

  test('two parallel bookings on one slot: exactly one 201, the other 409', async () => {
    const owner = await makeOwner();
    const { provider } = await makeProvider('approved');
    const v1 = await makeVehicle(owner._id.toString());
    const v2 = await makeVehicle(owner._id.toString());
    const slot = await makeSlot(provider._id.toString());

    const body = (vid: any) => ({ vehicleId: vid, providerId: provider._id, slotId: slot._id, documentType: 'puc' });
    const [r1, r2] = await Promise.all([
      request(app).post('/bookings').set('Authorization', authHeader(owner)).send(body(v1._id)),
      request(app).post('/bookings').set('Authorization', authHeader(owner)).send(body(v2._id))
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await Booking.countDocuments({ slotId: slot._id, status: 'pending' })).toBe(1);
  });
});

describe('GET /bookings — scoping', () => {
  test('owner sees only their own bookings', async () => {
    const owner = await makeOwner();
    const other = await makeOwner();
    const { provider } = await makeProvider('approved');
    // Each owner books on their OWN vehicle: the friends' branch added a partial
    // unique index (one active booking per vehicle+documentType), so two active
    // 'puc' bookings would have to be on different vehicles anyway.
    const ownerVehicle = await makeVehicle(owner._id.toString());
    const otherVehicle = await makeVehicle(other._id.toString());

    await Booking.create({ ownerId: owner._id, vehicleId: ownerVehicle._id, providerId: provider._id, slotId: (await makeSlot(provider._id.toString()))._id, documentType: 'puc', status: 'pending' });
    await Booking.create({ ownerId: other._id, vehicleId: otherVehicle._id, providerId: provider._id, slotId: (await makeSlot(provider._id.toString()))._id, documentType: 'puc', status: 'pending' });

    const res = await request(app).get('/bookings').set('Authorization', authHeader(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('provider sees bookings assigned to them', async () => {
    const owner = await makeOwner();
    const { user: provUser, provider } = await makeProvider('approved');
    const vehicle = await makeVehicle(owner._id.toString());
    await Booking.create({ ownerId: owner._id, vehicleId: vehicle._id, providerId: provider._id, slotId: (await makeSlot(provider._id.toString()))._id, documentType: 'puc', status: 'pending' });

    const res = await request(app).get('/bookings').set('Authorization', authHeader(provUser));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('PATCH /bookings/:id/status — completion (Trust Rule 1)', () => {
  const futureISO = (years: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    return d.toISOString();
  };

  const setup = async (bookingStatus: string, providerStatus: any = 'approved') => {
    const owner = await makeOwner();
    const { user: provUser, provider } = await makeProvider(providerStatus);
    const vehicle = await makeVehicle(owner._id.toString());
    const slot = await makeSlot(provider._id.toString(), { isBooked: true });
    const booking = await Booking.create({
      ownerId: owner._id, vehicleId: vehicle._id, providerId: provider._id,
      slotId: slot._id, documentType: 'puc', status: bookingStatus as any
    });
    return { owner, provUser, provider, vehicle, slot, booking };
  };

  test('rejects a status other than completed/cancelled (400)', async () => {
    const { provUser, booking } = await setup('pending');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(provUser))
      .field('status', 'confirmed');
    expect(res.status).toBe(400);
  });

  test('cannot complete a booking that is not yet confirmed (400)', async () => {
    const { provUser, booking } = await setup('pending');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(provUser))
      .field('status', 'completed')
      .attach('certificate', Buffer.from('%PDF-1.4 test'), 'cert.pdf');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/confirmed/);
  });

  test('cannot complete without a certificate file (400)', async () => {
    const { provUser, booking } = await setup('confirmed');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(provUser))
      .field('status', 'completed')
      .field('expiryDate', futureISO(1));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/certificate/i);
  });

  test('rejects an expiry date in the past (400)', async () => {
    const { provUser, booking } = await setup('confirmed');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(provUser))
      .field('status', 'completed')
      .field('expiryDate', '2000-01-01')
      .attach('certificate', Buffer.from('%PDF-1.4 test'), 'cert.pdf');
    expect(res.status).toBe(400);
  });

  test('a non-assigned provider cannot complete (403)', async () => {
    const { booking } = await setup('confirmed');
    const { user: strangerUser } = await makeProvider('approved');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(strangerUser))
      .field('status', 'completed')
      .field('expiryDate', futureISO(1))
      .attach('certificate', Buffer.from('%PDF-1.4 test'), 'cert.pdf');
    expect(res.status).toBe(403);
  });

  test('happy path: confirmed booking completes → verified Document + 3 reminders', async () => {
    const { provUser, vehicle, booking } = await setup('confirmed');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(provUser))
      .field('status', 'completed')
      .field('expiryDate', futureISO(1))
      .attach('certificate', Buffer.from('%PDF-1.4 test'), 'cert.pdf');

    expect(res.status).toBe(200);
    const doc = await DocumentModel.findOne({ vehicleId: vehicle._id, type: 'puc' });
    expect(doc).not.toBeNull();
    expect(doc!.verified).toBe(true);
    expect(doc!.lastUpdatedBy).toBe('provider');
    expect(doc!.fileHash).toHaveLength(64); // sha-256 hex
    const reminders = await Reminder.find({ documentId: doc!._id });
    expect(reminders.map((r) => r.thresholdDays).sort((a, b) => a - b)).toEqual([1, 7, 30]);
  });

  test('cancelling a booking releases its slot', async () => {
    const { provUser, slot, booking } = await setup('confirmed');
    const res = await request(app)
      .patch(`/bookings/${booking._id}/status`)
      .set('Authorization', authHeader(provUser))
      .field('status', 'cancelled');
    expect(res.status).toBe(200);
    const refreshed = await Slot.findById(slot._id);
    expect(refreshed!.isBooked).toBe(false);
  });
});
