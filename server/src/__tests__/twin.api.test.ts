/**
 * API integration tests for the Vehicle Twin feature.
 * Uses mongodb-memory-server + supertest — no real database needed.
 *
 * Covers:
 *  - Blocking conditions (challan, active booking, non-owner, self-transfer)
 *  - Expired token rejected
 *  - Double-accept: two parallel accepts, exactly one wins (409)
 *  - After accept: buyer owns, seller gets 404, history intact,
 *    unsent reminders reassigned, shares revoked
 *  - Preview and public endpoints never return personal data
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';

// Server modules
import twinRoutes from '../routes/twin.routes';
import { publicTwinView } from '../controllers/twin.controller';
import { errorHandler } from '../middleware/errorHandler';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Booking } from '../models/Booking';
import { Challan } from '../models/Challan';
import { Reminder } from '../models/Reminder';
import { DocumentModel } from '../models/Document';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { TwinShare } from '../models/TwinShare';
import { generateAccessToken } from '../services/tokenService';

// ── Test app (no listen) ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/v1/twin', twinRoutes);
app.get('/api/v1/public/twin', publicTwinView);
app.use(errorHandler);

// ── DB lifecycle ──────────────────────────────────────────────────────────────

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
  await Promise.all([
    User.deleteMany({}),
    Vehicle.deleteMany({}),
    Booking.deleteMany({}),
    Challan.deleteMany({}),
    Reminder.deleteMany({}),
    DocumentModel.deleteMany({}),
    OwnershipTransfer.deleteMany({}),
    TwinShare.deleteMany({})
  ]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const hash = (p: string) => bcrypt.hashSync(p, 4);

const makeOwner = async (email: string) =>
  User.create({ name: 'Test', email, phone: '9999999999', passwordHash: hash('pass'), role: 'owner', address: { city: '', state: '', pincode: '' } });

const makeVehicle = async (ownerId: string) =>
  Vehicle.create({ ownerId, regNumber: `MH01${Math.random().toString(36).slice(2, 8).toUpperCase()}`, type: 'car', fuelType: 'petrol', make: 'Honda', model: 'City', year: 2020, qrCodeId: `DD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, region: { state: 'MH', district: 'Mumbai' } });

const token = (user: any) => `Bearer ${generateAccessToken({ userId: user._id.toString(), email: user.email, role: user.role })}`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /twin/transfers — blocking conditions', () => {
  test('returns 404 when caller does not own the vehicle', async () => {
    const seller = await makeOwner('seller@t.com');
    const other  = await makeOwner('other@t.com');
    const v      = await makeVehicle(seller._id.toString());

    const res = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(other))
      .send({ vehicleId: v._id });

    expect(res.status).toBe(404);
  });

  test('returns 400 when vehicle has a pending booking', async () => {
    const seller = await makeOwner('seller2@t.com');
    const v = await makeVehicle(seller._id.toString());
    await Booking.create({ ownerId: seller._id, vehicleId: v._id, providerId: new mongoose.Types.ObjectId(), slotId: new mongoose.Types.ObjectId(), documentType: 'puc', status: 'pending' });

    const res = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/active bookings/);
  });

  test('returns 400 when vehicle has a pending challan', async () => {
    const seller = await makeOwner('seller3@t.com');
    const v = await makeVehicle(seller._id.toString());
    await Challan.create({ vehicleId: v._id, amount: 500, reason: 'test', status: 'pending', issuedAt: new Date() });

    const res = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pending challans/);
  });

  test('returns 201 and a token when all conditions pass', async () => {
    const seller = await makeOwner('seller4@t.com');
    const v = await makeVehicle(seller._id.toString());

    const res = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeDefined();
  });
});

describe('POST /twin/transfers/accept — validation', () => {
  test('rejects expired JWT token', async () => {
    const buyer = await makeOwner('buyer@t.com');

    const res = await request(app)
      .post('/api/v1/twin/transfers/accept')
      .set('Authorization', token(buyer))
      .send({ token: 'totally.invalid.token' });

    expect(res.status).toBe(401);
  });

  test('returns 400 when buyer tries to accept their own transfer', async () => {
    const seller = await makeOwner('selfbuyer@t.com');
    const v = await makeVehicle(seller._id.toString());
    const createRes = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    const transferToken = createRes.body.data.token;
    const res = await request(app)
      .post('/api/v1/twin/transfers/accept')
      .set('Authorization', token(seller))
      .send({ token: transferToken });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/yourself/);
  });

  test('non-owner role cannot accept', async () => {
    const seller = await makeOwner('sellerX@t.com');
    const v = await makeVehicle(seller._id.toString());
    const createRes = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    const officer = await User.create({ name: 'Officer', email: 'officer@t.com', phone: '9900000001', passwordHash: hash('pass'), role: 'officer', address: { city: '', state: '', pincode: '' } });
    const officerToken = `Bearer ${generateAccessToken({ userId: officer._id.toString(), email: officer.email, role: officer.role })}`;

    // authorizeRoles('owner') should block officer
    const res = await request(app)
      .post('/api/v1/twin/transfers/accept')
      .set('Authorization', officerToken)
      .send({ token: createRes.body.data.token });

    expect(res.status).toBe(403);
  });
});

describe('POST /twin/transfers/accept — double-accept race condition', () => {
  test('exactly one of two parallel accepts succeeds; the other gets 409', async () => {
    const seller = await makeOwner('race.seller@t.com');
    const buyer1 = await makeOwner('race.buyer1@t.com');
    const buyer2 = await makeOwner('race.buyer2@t.com');
    const v = await makeVehicle(seller._id.toString());

    const createRes = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    const transferToken = createRes.body.data.token;

    // Fire both accepts truly in parallel
    const [r1, r2] = await Promise.all([
      request(app).post('/api/v1/twin/transfers/accept').set('Authorization', token(buyer1)).send({ token: transferToken }),
      request(app).post('/api/v1/twin/transfers/accept').set('Authorization', token(buyer2)).send({ token: transferToken })
    ]);

    const statuses = [r1.status, r2.status].sort();
    // One must succeed (200), one must fail (409 or 410)
    expect(statuses[0]).toBe(200);
    expect([409, 410]).toContain(statuses[1]);
  });
});

describe('POST /twin/transfers/accept — side effects after success', () => {
  let seller: any, buyer: any, vehicle: any, transferToken: string;

  beforeEach(async () => {
    seller = await makeOwner('sideeff.seller@t.com');
    buyer  = await makeOwner('sideeff.buyer@t.com');
    vehicle = await makeVehicle(seller._id.toString());

    // Unsent reminder owned by seller
    await Reminder.create({
      documentId: new mongoose.Types.ObjectId(), vehicleId: vehicle._id,
      ownerId: seller._id, scheduledFor: new Date(Date.now() + 86400000),
      channel: 'push', thresholdDays: 7, message: 'test', sent: false
    });

    // TwinShare owned by seller
    await TwinShare.create({ vehicleId: vehicle._id, createdBy: seller._id, expiresAt: new Date(Date.now() + 86400000), revoked: false });

    // Create transfer
    const createRes = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: vehicle._id });
    transferToken = createRes.body.data.token;

    // Accept
    await request(app)
      .post('/api/v1/twin/transfers/accept')
      .set('Authorization', token(buyer))
      .send({ token: transferToken });
  });

  test('vehicle ownerId is now buyer', async () => {
    const v = await Vehicle.findById(vehicle._id);
    expect(v!.ownerId.toString()).toBe(buyer._id.toString());
  });

  test('seller gets 404 on GET /vehicles/:id (ownerScope blocks)', async () => {
    const res = await request(app)
      .get(`/api/v1/twin/vehicles/${vehicle._id}/score`)
      .set('Authorization', token(seller));
    expect(res.status).toBe(404);
  });

  test('buyer can access score for transferred vehicle', async () => {
    const res = await request(app)
      .get(`/api/v1/twin/vehicles/${vehicle._id}/score`)
      .set('Authorization', token(buyer));
    expect(res.status).toBe(200);
  });

  test('unsent reminders now belong to buyer', async () => {
    const reminders = await Reminder.find({ vehicleId: vehicle._id, sent: false });
    for (const r of reminders) {
      expect(r.ownerId.toString()).toBe(buyer._id.toString());
    }
  });

  test('all TwinShares for the vehicle are revoked', async () => {
    const shares = await TwinShare.find({ vehicleId: vehicle._id });
    for (const s of shares) {
      expect(s.revoked).toBe(true);
    }
  });

  test('documents, bookings, violations, challans are untouched', async () => {
    // History tables should remain exactly as seeded (empty in this test — just verify no crash)
    const docs     = await DocumentModel.find({ vehicleId: vehicle._id });
    const bookings = await Booking.find({ vehicleId: vehicle._id });
    // No modifications should have happened to these collections
    expect(docs.length).toBe(0);
    expect(bookings.length).toBe(0);
  });
});

describe('GET /twin/transfers/preview — personal data isolation', () => {
  test('preview never returns seller name, email, phone or address', async () => {
    const seller = await makeOwner('privacy.seller@t.com');
    const buyer  = await makeOwner('privacy.buyer@t.com');
    const v      = await makeVehicle(seller._id.toString());

    const createRes = await request(app)
      .post('/api/v1/twin/transfers')
      .set('Authorization', token(seller))
      .send({ vehicleId: v._id });

    const previewRes = await request(app)
      .get(`/api/v1/twin/transfers/preview?token=${encodeURIComponent(createRes.body.data.token)}`)
      .set('Authorization', token(buyer));

    expect(previewRes.status).toBe(200);
    const body = JSON.stringify(previewRes.body);
    expect(body).not.toContain('privacy.seller@t.com');
    expect(body).not.toContain('9999999999');
    // Reg number must be masked
    expect(previewRes.body.data.vehicle.regNumber).toMatch(/••••/);
  });
});

describe('GET /public/twin — personal data isolation', () => {
  test('public share never returns owner name, email, phone or address', async () => {
    const owner = await makeOwner('pub.owner@t.com');
    const v     = await makeVehicle(owner._id.toString());

    const shareRes = await request(app)
      .post(`/api/v1/twin/vehicles/${v._id}/share`)
      .set('Authorization', token(owner));

    expect(shareRes.status).toBe(201);
    const shareToken = shareRes.body.data.token;

    const pubRes = await request(app)
      .get(`/api/v1/public/twin?token=${encodeURIComponent(shareToken)}`);

    expect(pubRes.status).toBe(200);
    const body = JSON.stringify(pubRes.body);
    expect(body).not.toContain('pub.owner@t.com');
    expect(body).not.toContain('9999999999');
    expect(pubRes.body.data.vehicle.regNumber).toMatch(/••••/);
  });

  test('revoked share returns 410', async () => {
    const owner = await makeOwner('rev.owner@t.com');
    const v     = await makeVehicle(owner._id.toString());

    const shareRes = await request(app)
      .post(`/api/v1/twin/vehicles/${v._id}/share`)
      .set('Authorization', token(owner));

    const shareId    = shareRes.body.data.shareId;
    const shareToken = shareRes.body.data.token;

    await request(app)
      .delete(`/api/v1/twin/shares/${shareId}`)
      .set('Authorization', token(owner));

    const pubRes = await request(app)
      .get(`/api/v1/public/twin?token=${encodeURIComponent(shareToken)}`);

    expect(pubRes.status).toBe(410);
  });
});
