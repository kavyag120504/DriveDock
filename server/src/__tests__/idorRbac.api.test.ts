/**
 * Phase 2: IDOR (cross-account access) + RBAC (role-gate) matrix.
 *
 * IDOR — user B must never reach user A's vehicle/documents/booking/payment/challan/
 * twin resources. Per the access rules, vehicle-keyed lookups 404 when not allowed and
 * booking-/payment-keyed lookups 403.
 *
 * RBAC — public roles can't reach admin/officer endpoints; owner-only twin routes
 * reject non-owners; government may read analytics but not create staff.
 *
 * Behaviour-only tests; nothing in the app changes.
 */

import express from 'express';
import request from 'supertest';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { Challan } from '../models/Challan';
import { DocumentModel } from '../models/Document';
import {
  setupTestDB,
  teardownTestDB,
  clearDB,
  makeOwner,
  makeUser,
  makeProvider,
  makeVehicle,
  makeSlot,
  authHeader
} from './helpers';

const app = express();
app.use(express.json());
app.use('/api/v1', mainRouter);
app.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

const h = (u: any) => ({ Authorization: authHeader(u) });

describe('IDOR — one owner cannot reach another owner’s resources', () => {
  it('vehicle, documents and challans are 404 across accounts', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const vehicle = await makeVehicle(a._id.toString());
    await DocumentModel.create({
      vehicleId: vehicle._id, type: 'puc', fileUrl: 'x', fileHash: 'y',
      issueDate: new Date(), expiryDate: new Date(Date.now() + 86400000),
      status: 'valid', lastUpdatedBy: 'owner', verified: false
    });
    await Challan.create({ vehicleId: vehicle._id, amount: 1000, reason: 'test', status: 'pending', issuedAt: new Date() });

    const id = vehicle._id.toString();
    expect((await request(app).get(`/api/v1/vehicles/${id}`).set(h(b))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/vehicles/${id}`).set(h(b)).send({ make: 'Hacked' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/vehicles/${id}`).set(h(b))).status).toBe(404);
    expect((await request(app).get(`/api/v1/vehicles/${id}/documents`).set(h(b))).status).toBe(404);
    expect((await request(app).get(`/api/v1/vehicles/${id}/qr-token`).set(h(b))).status).toBe(404);
    expect((await request(app).get(`/api/v1/challans/${id}`).set(h(b))).status).toBe(404);

    // ...and the owner themselves still gets through.
    expect((await request(app).get(`/api/v1/vehicles/${id}`).set(h(a))).status).toBe(200);
  });

  it('a booking and its payment are 403 across accounts', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const { provider } = await makeProvider('approved');
    const vehicle = await makeVehicle(a._id.toString());
    const slot = await makeSlot(provider._id.toString(), { isBooked: true });
    const booking = await Booking.create({
      ownerId: a._id, vehicleId: vehicle._id, providerId: provider._id,
      slotId: slot._id, documentType: 'puc', status: 'pending'
    });
    await Payment.create({ bookingId: booking._id, amount: 250, razorpayOrderId: 'order_idor', status: 'created' });

    expect((await request(app).get(`/api/v1/bookings/${booking._id}`).set(h(b))).status).toBe(403);
    expect((await request(app).post('/api/v1/payments/create-order').set(h(b)).send({ bookingId: booking._id })).status).toBe(403);
    expect((await request(app)
      .post('/api/v1/payments/verify')
      .set(h(b))
      .send({ razorpayOrderId: 'order_idor', razorpayPaymentId: 'p', razorpaySignature: 'deadbeefdeadbeef' })).status).toBe(403);

    // The real owner is allowed (not 403).
    expect((await request(app).get(`/api/v1/bookings/${booking._id}`).set(h(a))).status).toBe(200);
  });

  it('twin score/timeline are 404 for a non-owner of the vehicle', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const vehicle = await makeVehicle(a._id.toString());
    const id = vehicle._id.toString();
    expect((await request(app).get(`/api/v1/twin/vehicles/${id}/score`).set(h(b))).status).toBe(404);
    expect((await request(app).get(`/api/v1/twin/vehicles/${id}/timeline`).set(h(b))).status).toBe(404);
  });
});

describe('RBAC — role gates on privileged routes', () => {
  it('owner and provider cannot reach admin routes (403)', async () => {
    for (const role of ['owner', 'provider'] as const) {
      const u = role === 'provider' ? (await makeProvider('approved')).user : await makeUser(role);
      expect((await request(app).get('/api/v1/admin/providers').set(h(u))).status).toBe(403);
      expect((await request(app).post('/api/v1/admin/users').set(h(u)).send({
        name: 'X', email: 'x@y.com', phone: '9', password: 'passw0rd', role: 'officer'
      })).status).toBe(403);
      expect((await request(app).get('/api/v1/admin/stats/overview').set(h(u))).status).toBe(403);
    }
  });

  it('government may read analytics but not create staff', async () => {
    const gov = await makeUser('government');
    expect((await request(app).get('/api/v1/admin/stats/overview').set(h(gov))).status).toBe(200);
    expect((await request(app).post('/api/v1/admin/users').set(h(gov)).send({
      name: 'X', email: 'x@y.com', phone: '9', password: 'passw0rd', role: 'officer'
    })).status).toBe(403);
  });

  it('only officer/admin may log a violation', async () => {
    const owner = await makeOwner();
    const officer = await makeUser('officer');
    const vehicle = await makeVehicle(owner._id.toString());

    // Owner is blocked by the role gate.
    expect((await request(app).post('/api/v1/violations').set(h(owner)).send({
      vehicleId: vehicle._id, documentTypeExpired: ['puc'], location: 'MG Road'
    })).status).toBe(403);

    // Officer passes the gate and issues the challan.
    const ok = await request(app).post('/api/v1/violations').set(h(officer)).send({
      vehicleId: vehicle._id, documentTypeExpired: ['puc'], location: 'MG Road'
    });
    expect(ok.status).toBe(201);
  });

  it('owner-only twin routes reject a non-owner role (403)', async () => {
    const officer = await makeUser('officer');
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    expect((await request(app).get(`/api/v1/twin/vehicles/${vehicle._id}/score`).set(h(officer))).status).toBe(403);
    expect((await request(app).post('/api/v1/twin/transfers').set(h(officer)).send({ vehicleId: vehicle._id })).status).toBe(403);
  });
});
