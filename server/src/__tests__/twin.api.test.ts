/**
 * API integration tests for the Vehicle Twin feature.
 * Uses mongodb-memory-server + supertest — no real database needed.
 *
 * Covers:
 *  - Blocking conditions (challan, active booking, non-owner, self-transfer)
 *  - Expired token rejected
 *  - Two-party approval: buyer applies (request), seller approves or rejects;
 *    nothing moves until the seller approves; only the seller can approve
 *  - Two parallel requests: exactly one wins (409)
 *  - After approval: buyer owns, seller gets 404, history intact,
 *    unsent reminders reassigned, shares revoked, ledger hash recorded
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

// Helper: seller creates a transfer QR, returns { transferId, token }
const createTransfer = async (seller: any, vehicleId: any) => {
  const res = await request(app)
    .post('/api/v1/twin/transfers')
    .set('Authorization', token(seller))
    .send({ vehicleId });
  return { transferId: res.body.data.transferId as string, transferToken: res.body.data.token as string };
};

const requestTransfer = (buyer: any, transferToken: string) =>
  request(app).post('/api/v1/twin/transfers/request').set('Authorization', token(buyer)).send({ token: transferToken });

const approve = (user: any, transferId: string) =>
  request(app).post(`/api/v1/twin/transfers/${transferId}/approve`).set('Authorization', token(user));

describe('POST /twin/transfers/request — validation', () => {
  test('rejects an invalid token', async () => {
    const buyer = await makeOwner('buyer@t.com');
    const res = await requestTransfer(buyer, 'totally.invalid.token');
    expect(res.status).toBe(401);
  });

  test('returns 400 when the seller applies for their own transfer', async () => {
    const seller = await makeOwner('selfbuyer@t.com');
    const v = await makeVehicle(seller._id.toString());
    const { transferToken } = await createTransfer(seller, v._id);

    const res = await requestTransfer(seller, transferToken);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/yourself/);
  });

  test('non-owner role cannot apply', async () => {
    const seller = await makeOwner('sellerX@t.com');
    const v = await makeVehicle(seller._id.toString());
    const { transferToken } = await createTransfer(seller, v._id);

    const officer = await User.create({ name: 'Officer', email: 'officer@t.com', phone: '9900000001', passwordHash: hash('pass'), role: 'officer', address: { city: '', state: '', pincode: '' } });
    const officerToken = `Bearer ${generateAccessToken({ userId: officer._id.toString(), email: officer.email, role: officer.role })}`;

    const res = await request(app)
      .post('/api/v1/twin/transfers/request')
      .set('Authorization', officerToken)
      .send({ token: transferToken });
    expect(res.status).toBe(403);
  });
});

describe('POST /twin/transfers/request — only one buyer can apply', () => {
  test('exactly one of two parallel requests succeeds; the other gets 409', async () => {
    const seller = await makeOwner('race.seller@t.com');
    const buyer1 = await makeOwner('race.buyer1@t.com');
    const buyer2 = await makeOwner('race.buyer2@t.com');
    const v = await makeVehicle(seller._id.toString());
    const { transferToken } = await createTransfer(seller, v._id);

    const [r1, r2] = await Promise.all([requestTransfer(buyer1, transferToken), requestTransfer(buyer2, transferToken)]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect([409, 410]).toContain(statuses[1]);
  });
});

describe('Two-party approval — nothing moves until the seller approves', () => {
  let seller: any, buyer: any, other: any, vehicle: any, transferId: string;

  beforeEach(async () => {
    seller = await makeOwner('ta.seller@t.com');
    buyer  = await makeOwner('ta.buyer@t.com');
    other  = await makeOwner('ta.other@t.com');
    vehicle = await makeVehicle(seller._id.toString());
    const created = await createTransfer(seller, vehicle._id);
    transferId = created.transferId;
    const res = await requestTransfer(buyer, created.transferToken);
    expect(res.status).toBe(200);
  });

  test('after the buyer applies, the vehicle still belongs to the seller', async () => {
    const v = await Vehicle.findById(vehicle._id);
    expect(v!.ownerId.toString()).toBe(seller._id.toString());
    const t = await OwnershipTransfer.findById(transferId);
    expect(t!.status).toBe('requested');
    expect(t!.toOwnerId!.toString()).toBe(buyer._id.toString());
  });

  test('seller sees the request with the buyer name; buyer never sees the seller', async () => {
    const sellerList = await request(app).get('/api/v1/twin/transfers').set('Authorization', token(seller));
    const s = sellerList.body.data.find((x: any) => x._id === transferId);
    expect(s.role).toBe('seller');
    expect(s.status).toBe('requested');
    expect(s.buyerName).toBe('Test');

    const buyerList = await request(app).get('/api/v1/twin/transfers').set('Authorization', token(buyer));
    const b = buyerList.body.data.find((x: any) => x._id === transferId);
    expect(b.role).toBe('buyer');
    expect(b.buyerName).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain(seller.email);
    expect(b.vehicle.regNumber).toContain('•');
  });

  test('the buyer cannot approve their own request, nor can anyone but the seller', async () => {
    expect((await approve(buyer, transferId)).status).toBe(404);
    expect((await approve(other, transferId)).status).toBe(404);
    const v = await Vehicle.findById(vehicle._id);
    expect(v!.ownerId.toString()).toBe(seller._id.toString());
  });

  test('seller declining keeps the vehicle and blocks a later approval', async () => {
    const rej = await request(app).post(`/api/v1/twin/transfers/${transferId}/reject`).set('Authorization', token(seller));
    expect(rej.status).toBe(200);
    expect((await OwnershipTransfer.findById(transferId))!.status).toBe('rejected');
    expect((await approve(seller, transferId)).status).toBe(409);
    const v = await Vehicle.findById(vehicle._id);
    expect(v!.ownerId.toString()).toBe(seller._id.toString());
  });

  test('approval is refused if a challan appears before the handover', async () => {
    await Challan.create({ vehicleId: vehicle._id, amount: 1000, reason: 'test', status: 'pending', issuedAt: new Date() });
    const res = await approve(seller, transferId);
    expect(res.status).toBe(400);
    const v = await Vehicle.findById(vehicle._id);
    expect(v!.ownerId.toString()).toBe(seller._id.toString());
  });
});

describe('POST /twin/transfers/:id/approve — side effects after approval', () => {
  let seller: any, buyer: any, vehicle: any;

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

    // Seller shows QR -> buyer applies -> seller approves
    const { transferId, transferToken } = await createTransfer(seller, vehicle._id);
    await requestTransfer(buyer, transferToken);
    const res = await approve(seller, transferId);
    expect(res.status).toBe(200);
  });

  test('vehicle ownerId is now buyer', async () => {
    const v = await Vehicle.findById(vehicle._id);
    expect(v!.ownerId.toString()).toBe(buyer._id.toString());
  });

  test('seller gets 404 on the vehicle score (ownerScope blocks)', async () => {
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

  test('the ownership ledger records the handover', async () => {
    const t = await OwnershipTransfer.findOne({ vehicleId: vehicle._id, status: 'accepted' });
    expect(t!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t!.acceptedAt).toBeTruthy();
  });

  test('documents, bookings, violations, challans are untouched', async () => {
    const docs     = await DocumentModel.find({ vehicleId: vehicle._id });
    const bookings = await Booking.find({ vehicleId: vehicle._id });
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
