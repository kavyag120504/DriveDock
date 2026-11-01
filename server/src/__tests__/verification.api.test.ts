/**
 * Characterization tests for public QR verification (Trust Rules 2 & 4):
 * GREEN only when all five documents exist, are valid, not expired AND verified;
 * forged / expired tokens are rejected.
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import verificationRoutes from '../routes/verificationRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { DocumentModel, DocumentType } from '../models/Document';
import { generateQRToken } from '../services/qrService';
import { ENV } from '../config/env';
import { setupTestDB, teardownTestDB, clearDB, makeOwner, makeVehicle } from './helpers';

const app = express();
app.use(express.json());
app.use('/public', verificationRoutes);
app.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

const ALL_TYPES: DocumentType[] = ['rc', 'insurance', 'puc', 'license', 'fitness'];

const addDoc = (vehicleId: any, type: DocumentType, overrides: Record<string, any> = {}) => {
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
  return DocumentModel.create({
    vehicleId,
    type,
    fileUrl: 'http://x/doc.pdf',
    fileHash: 'a'.repeat(64),
    issueDate: new Date('2024-01-01'),
    expiryDate: overrides.expiryDate || future,
    status: overrides.status || 'valid',
    lastUpdatedBy: 'provider',
    verified: overrides.verified ?? true,
    issuedByProviderId: null
  });
};

const makeCompliantVehicle = async () => {
  const owner = await makeOwner();
  const vehicle = await makeVehicle(owner._id.toString());
  for (const t of ALL_TYPES) await addDoc(vehicle._id, t);
  return vehicle;
};

const tokenFor = (vehicle: any) => generateQRToken(vehicle._id.toString(), vehicle.regNumber).token;

describe('GET /public/verify — token validation', () => {
  test('missing token returns 400 + RED', async () => {
    const res = await request(app).get('/public/verify');
    expect(res.status).toBe(400);
    expect(res.body.compliance).toBe('RED');
  });

  test('forged token (wrong secret) returns 401 + RED', async () => {
    const forged = jwt.sign({ vehicleId: 'x', regNumber: 'y', timestamp: 1, nonce: 'z' }, 'not-the-qr-secret', {
      expiresIn: '120s'
    });
    const res = await request(app).get('/public/verify').query({ token: forged });
    expect(res.status).toBe(401);
    expect(res.body.compliance).toBe('RED');
  });

  test('expired token returns 401 + RED', async () => {
    const expired = jwt.sign({ vehicleId: 'x', regNumber: 'y', timestamp: 1, nonce: 'z' }, ENV.QR_SECRET, {
      expiresIn: '-10s'
    });
    const res = await request(app).get('/public/verify').query({ token: expired });
    expect(res.status).toBe(401);
  });

  test('valid token for a non-existent vehicle returns 404', async () => {
    const token = jwt.sign(
      { vehicleId: '507f1f77bcf86cd799439011', regNumber: 'MH01ZZ0000', timestamp: 1, nonce: 'z' },
      ENV.QR_SECRET,
      { expiresIn: '120s' }
    );
    const res = await request(app).get('/public/verify').query({ token });
    expect(res.status).toBe(404);
  });
});

describe('GET /public/verify — compliance evaluation', () => {
  test('GREEN when all five documents are valid, unexpired and verified', async () => {
    const vehicle = await makeCompliantVehicle();
    const res = await request(app).get('/public/verify').query({ token: tokenFor(vehicle) });
    expect(res.status).toBe(200);
    expect(res.body.compliance).toBe('GREEN');
    expect(res.body.data.isFullyCompliant).toBe(true);
  });

  test('RED when a document is missing', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    for (const t of ALL_TYPES.filter((t) => t !== 'fitness')) await addDoc(vehicle._id, t);
    const res = await request(app).get('/public/verify').query({ token: tokenFor(vehicle) });
    expect(res.body.compliance).toBe('RED');
    expect(res.body.data.issues.missingDocs).toContain('FITNESS');
  });

  test('RED when a document is owner-uploaded but unverified', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    for (const t of ALL_TYPES) await addDoc(vehicle._id, t, { verified: t !== 'puc' });
    const res = await request(app).get('/public/verify').query({ token: tokenFor(vehicle) });
    expect(res.body.compliance).toBe('RED');
    expect(res.body.data.issues.unverifiedDocs).toContain('PUC');
  });

  test('RED when a document is expired', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    for (const t of ALL_TYPES) {
      await addDoc(vehicle._id, t, t === 'insurance' ? { expiryDate: new Date('2000-01-01') } : {});
    }
    const res = await request(app).get('/public/verify').query({ token: tokenFor(vehicle) });
    expect(res.body.compliance).toBe('RED');
    expect(res.body.data.issues.expiredDocs).toContain('INSURANCE');
  });

  test('public verify never leaks the owner phone number', async () => {
    const vehicle = await makeCompliantVehicle();
    const res = await request(app).get('/public/verify').query({ token: tokenFor(vehicle) });
    expect(JSON.stringify(res.body)).not.toContain('9999999999');
  });
});
