/**
 * Phase 2 DPDP groundwork:
 *  - GET /auth/export returns a machine-readable copy of the caller's own data
 *    (no password hash, no other users' PII);
 *  - GET /admin/stats/by-region applies small-number suppression for the government
 *    dashboard (regions with < 10 vehicles hidden) while a full admin still sees all.
 */

import express from 'express';
import request from 'supertest';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import {
  setupTestDB,
  teardownTestDB,
  clearDB,
  makeOwner,
  makeUser,
  makeProvider,
  makeVehicle,
  authHeader
} from './helpers';

const app = express();
app.use(express.json());
app.use('/api/v1', mainRouter);
app.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

describe('GET /auth/export', () => {
  it("returns the caller's own data without the password hash", async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    await DocumentModel.create({
      vehicleId: vehicle._id, type: 'puc', fileUrl: 'x', fileHash: 'y',
      issueDate: new Date(), expiryDate: new Date(Date.now() + 86400000),
      status: 'valid', lastUpdatedBy: 'owner', verified: false
    });

    const res = await request(app).get('/api/v1/auth/export').set('Authorization', authHeader(owner));

    expect(res.status).toBe(200);
    expect(res.body.data.profile.email).toBe(owner.email);
    expect(res.body.data.vehicles).toHaveLength(1);
    expect(res.body.data.documents).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/auth/export');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /auth/account — right to erasure (owner only)', () => {
  it('deletes a clean owner account and records an audit row', async () => {
    const owner = await makeOwner();
    const res = await request(app).delete('/api/v1/auth/account').set('Authorization', authHeader(owner));

    expect(res.status).toBe(200);
    expect(await User.findById(owner._id)).toBeNull();
    const audits = await AuditLog.find({ action: 'account_deleted' });
    expect(audits).toHaveLength(1);
    expect(String(audits[0].entityId)).toBe(String(owner._id));
  });

  it('refuses (409) while the owner still holds vehicles', async () => {
    const owner = await makeOwner();
    await makeVehicle(owner._id.toString());
    const res = await request(app).delete('/api/v1/auth/account').set('Authorization', authHeader(owner));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_IN_USE');
    expect(await User.findById(owner._id)).not.toBeNull(); // still there
  });

  it('is not available to non-owner accounts (400)', async () => {
    const { user: providerUser } = await makeProvider('approved');
    const res = await request(app).delete('/api/v1/auth/account').set('Authorization', authHeader(providerUser));
    expect(res.status).toBe(400);
    expect(await User.findById(providerUser._id)).not.toBeNull();
  });
});

describe('GET /admin/stats/by-region — small-number suppression', () => {
  const seedRegions = async () => {
    const owner = await makeOwner();
    // One small region (below threshold) and one large region (at/above threshold).
    await Vehicle.create({
      ownerId: owner._id, regNumber: 'SMALL0001', type: 'car', fuelType: 'petrol',
      make: 'M', model: 'X', year: 2020, qrCodeId: 'DD-SMALL', region: { state: 'Tiny', district: 'Tiny' }
    });
    for (let i = 0; i < 10; i++) {
      await Vehicle.create({
        ownerId: owner._id, regNumber: `BIG${1000 + i}`, type: 'car', fuelType: 'petrol',
        make: 'M', model: 'X', year: 2020, qrCodeId: `DD-BIG${i}`, region: { state: 'Big', district: 'Big' }
      });
    }
  };

  it('hides regions under 10 vehicles from a government viewer', async () => {
    await seedRegions();
    const gov = await makeUser('government');
    const res = await request(app).get('/api/v1/admin/stats/by-region').set('Authorization', authHeader(gov));

    expect(res.status).toBe(200);
    const states = res.body.data.map((r: any) => r.state);
    expect(states).toContain('Big');
    expect(states).not.toContain('Tiny');
    expect(res.body.suppressedRegions).toBe(1);
  });

  it('shows every region to a full admin', async () => {
    await seedRegions();
    const admin = await makeUser('admin');
    const res = await request(app).get('/api/v1/admin/stats/by-region').set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    const states = res.body.data.map((r: any) => r.state).sort();
    expect(states).toEqual(['Big', 'Tiny']);
    expect(res.body.suppressedRegions).toBeUndefined();
  });
});
