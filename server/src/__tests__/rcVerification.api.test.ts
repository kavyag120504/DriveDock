import express from 'express';
import request from 'supertest';
import { ENV } from '../config/env';
import { DocumentModel } from '../models/Document';
import { AuditLog } from '../models/AuditLog';
import { providers } from '../providers';
import { RcVerificationError, parseAryaRcResponse } from '../providers/aryaRegistry';
import { RegistryVehicle } from '../providers/registry';
import vehicleRoutes from '../routes/vehicleRoutes';
import documentRoutes from '../routes/documentRoutes';
import verificationRoutes from '../routes/verificationRoutes';
import { generateQRToken } from '../services/qrService';
import { buildTimeline } from '../services/twinTimeline.service';
import { errorHandler } from '../middleware/errorHandler';
import { setupTestDB, teardownTestDB, clearDB, makeOwner, makeUser, makeVehicle, authHeader } from './helpers';

jest.mock('../providers', () => ({ providers: { registry: { mode: 'real', lookup: jest.fn() } } }));
const lookup = providers.registry.lookup as jest.Mock;
const app = express();
app.use(express.json());
app.use('/vehicles', vehicleRoutes);
app.use('/documents', documentRoutes);
app.use('/public', verificationRoutes);
app.use(errorHandler);

const original = { enabled: ENV.RC_VERIFICATION_ENABLED, token: ENV.ARYA_API_TOKEN };
beforeAll(setupTestDB);
beforeEach(() => {
  // Only this isolated test process is configured. No env files or real API keys are used.
  ENV.RC_VERIFICATION_ENABLED = true;
  ENV.ARYA_API_TOKEN = 'mock-test-token';
  lookup.mockReset();
  lookup.mockImplementation(async (registrationNumber) => activeRecord(registrationNumber));
});
afterEach(clearDB);
afterAll(async () => {
  ENV.RC_VERIFICATION_ENABLED = original.enabled;
  ENV.ARYA_API_TOKEN = original.token;
  await teardownTestDB();
});

const activeRecord = (registrationNumber: string, extra: Partial<RegistryVehicle> = {}): RegistryVehicle => ({
  registrationNumber, status: 'active', found: true, registrationDate: '2023-02-14',
  rcValidUpto: '2099-02-13', fitnessValidUpto: '2099-02-13', insuranceValidUpto: null,
  pucValidUpto: null, makeModel: 'TEST', fuelType: 'petrol', challansPending: false,
  referenceId: 'test-reference', ...extra
});

const fixture = async (upload = true) => {
  const owner = await makeOwner();
  const vehicle = await makeVehicle(owner._id.toString(), { regNumber: 'MH01AB1234' });
  const doc = upload ? await DocumentModel.create({ vehicleId: vehicle._id, type: 'rc',
    fileUrl: 'http://test.invalid/rc.pdf', fileHash: 'a'.repeat(64),
    issueDate: new Date('2024-01-01'), expiryDate: new Date('2090-01-01'),
    status: 'valid', lastUpdatedBy: 'owner', verified: false }) : null;
  const url = `/vehicles/${vehicle._id}/rc-verification`;
  const post = (body: any = { consent: true }) => request(app).post(url).set('Authorization', authHeader(owner)).send(body);
  return { owner, vehicle, doc, url, post };
};

test('GET reports availability without a paid call or exposing configuration', async () => {
  const { owner, url } = await fixture();
  const res = await request(app).get(url).set('Authorization', authHeader(owner));
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({ enabled: true, latest: null, provider: 'arya' });
  expect(JSON.stringify(res.body)).not.toContain('mock-test-token');
  expect(lookup).not.toHaveBeenCalled();
});

test('requires authentication, an authorised role and ownership before contacting Arya', async () => {
  const { url } = await fixture();
  expect((await request(app).post(url).send({ consent: true })).status).toBe(401);
  const other = await makeOwner();
  expect((await request(app).post(url).set('Authorization', authHeader(other)).send({ consent: true })).status).toBe(404);
  const officer = await makeUser('officer');
  expect((await request(app).post(url).set('Authorization', authHeader(officer)).send({ consent: true })).status).toBe(403);
  expect(lookup).not.toHaveBeenCalled();
});

test('requires explicit consent; cannot be enabled by client input', async () => {
  const { post } = await fixture();
  expect((await post({})).status).toBe(400);
  ENV.RC_VERIFICATION_ENABLED = false;
  expect((await post({ consent: true, enabled: true, verified: true })).status).toBe(503);
  ENV.RC_VERIFICATION_ENABLED = true;
  ENV.ARYA_API_TOKEN = '';
  expect((await post()).status).toBe(503);
  expect(lookup).not.toHaveBeenCalled();
});

test('requires an uploaded RC and rejects invalid vehicle IDs without a paid call', async () => {
  const { owner, post } = await fixture(false);
  expect((await post()).status).toBe(409);
  expect((await request(app).post('/vehicles/bad-id/rc-verification').set('Authorization', authHeader(owner)).send({ consent: true })).status).toBe(400);
  expect(lookup).not.toHaveBeenCalled();
});

test('complete valid registry evidence sets authoritative dates and source; QR and Twin reflect it', async () => {
  const { post, doc, vehicle, url, owner } = await fixture();
  const res = await post({ consent: true, rc_num: 'DL01ZZ9999', verified: true });
  expect(res.status).toBe(200);
  expect(lookup).toHaveBeenCalledWith('MH01AB1234');
  expect(res.body.data.result).toMatchObject({ outcome: 'verified', provider: 'arya' });
  const saved = await DocumentModel.findById(doc!._id);
  expect(saved).toMatchObject({ verified: true, verificationSource: 'arya', lastUpdatedBy: 'registry', issuedByProviderId: null });
  expect(saved!.issueDate.toISOString()).toBe('2023-02-13T18:30:00.000Z');
  expect(saved!.expiryDate.toISOString()).toBe('2099-02-13T18:29:59.999Z');
  expect(await AuditLog.countDocuments({ action: 'rc_registry_checked' })).toBe(1);
  expect((await buildTimeline(vehicle._id))[0].detail).toContain('Arya');
  for (const type of ['insurance', 'puc', 'license', 'fitness']) {
    await DocumentModel.create({ vehicleId: vehicle._id, type, fileUrl: 'http://test.invalid/doc.pdf',
      fileHash: 'x', issueDate: new Date('2024-01-01'), expiryDate: new Date('2099-01-01'), verified: true, lastUpdatedBy: 'provider' });
  }
  const token = generateQRToken(vehicle._id.toString(), vehicle.regNumber).token;
  const qr = await request(app).get('/public/verify').query({ token });
  expect(qr.body.compliance).toBe('GREEN');
  expect(qr.body.data.documents.find((d: any) => d.type === 'rc').verificationSource).toBe('arya');
  const status = await request(app).get(url).set('Authorization', authHeader(owner));
  expect(status.body.data.latest.outcome).toBe('verified');
  expect(lookup).toHaveBeenCalledTimes(1);
});

test('the supplied V1 Lite shape only matches the record: fitness expiry cannot certify RC validity', async () => {
  const { post, doc, vehicle } = await fixture();
  lookup.mockResolvedValue(parseAryaRcResponse({ success: true, data: { rc_number: vehicle.regNumber,
    rc_status: 'ACTIVE', registration_date: '2023-02-14', blacklist_status: 'NA', fit_up_to: '2038-02-13' }
  }, vehicle.regNumber, 'test-reference'));
  const res = await post();
  expect(res.status).toBe(200);
  expect(res.body.data.result.outcome).toBe('record_matched');
  expect((await DocumentModel.findById(doc!._id))!.verified).toBe(false);
  const qr = await request(app).get('/public/verify').query({ token: generateQRToken(vehicle._id.toString(), vehicle.regNumber).token });
  expect(qr.body.compliance).toBe('RED');
});

test.each([
  [{ status: 'inactive' }, 'inactive'], [{ status: 'suspended' }, 'inactive'],
  [{ rcValidUpto: '2000-01-01' }, 'expired'], [{ found: false }, 'not_found'],
  [{ status: 'unknown' }, 'unconfirmed'], [{ registrationDate: '2099-01-01' }, 'unconfirmed']
])('unusable evidence %j cannot leave a previous Arya verification valid', async (extra, outcome) => {
  const { post, doc, vehicle } = await fixture();
  await DocumentModel.updateOne({ _id: doc!._id }, { verified: true, verificationSource: 'arya' });
  lookup.mockResolvedValue(activeRecord(vehicle.regNumber, extra as Partial<RegistryVehicle>));
  const res = await post();
  expect(res.status).toBe(200);
  expect(res.body.data.result.outcome).toBe(outcome);
  expect((await DocumentModel.findById(doc!._id))!.verified).toBe(false);
});

test('recent checks are cached for the same upload, saving credits', async () => {
  const { post } = await fixture();
  expect((await post()).body.data.cached).toBe(false);
  expect((await post()).body.data.cached).toBe(true);
  expect(lookup).toHaveBeenCalledTimes(1);
});

test('inconclusive evidence does not erase a previous provider certification', async () => {
  const { post, doc, vehicle } = await fixture();
  await DocumentModel.updateOne({ _id: doc!._id }, { verified: true, verificationSource: 'provider' });
  lookup.mockResolvedValue(activeRecord(vehicle.regNumber, { rcValidUpto: null }));
  expect((await post()).body.data.result.outcome).toBe('record_matched');
  expect((await DocumentModel.findById(doc!._id))!.verificationSource).toBe('provider');
});

test('vendor errors leave records untouched and expose only safe messages', async () => {
  const { post, doc } = await fixture();
  lookup.mockRejectedValue(new RcVerificationError('RC_TIMEOUT', 504, 'RC verification timed out. Try again later.'));
  expect((await post()).status).toBe(504);
  lookup.mockRejectedValue(new Error('mock-test-token private vendor response'));
  const res = await post();
  expect(res.status).toBe(502);
  expect(JSON.stringify(res.body)).not.toMatch(/mock-test-token|private vendor/);
  expect((await DocumentModel.findById(doc!._id))!.registryVerification).toBeUndefined();
});

test('a replaced upload during lookup is never certified by the old request', async () => {
  const { post, doc, vehicle } = await fixture();
  lookup.mockImplementation(async () => {
    await DocumentModel.updateOne({ _id: doc!._id }, { fileHash: 'b'.repeat(64), verified: false });
    return activeRecord(vehicle.regNumber);
  });
  expect((await post()).status).toBe(409);
  expect((await DocumentModel.findById(doc!._id))!.verified).toBe(false);
});

test('manual date edits clear registry proof; the next request is not cached', async () => {
  const { post, doc, owner } = await fixture();
  await post();
  const edit = await request(app).patch(`/documents/${doc!._id}`).set('Authorization', authHeader(owner)).send({ expiryDate: '2090-02-01' });
  expect(edit.status).toBe(200);
  const saved = await DocumentModel.findById(doc!._id);
  expect(saved!.verified).toBe(false);
  expect(saved!.verificationSource).toBeNull();
  expect(saved!.registryVerification).toBeUndefined();
  expect((await post()).body.data.cached).toBe(false);
  expect(lookup).toHaveBeenCalledTimes(2);
});

describe('vendor sandbox (testMode) results', () => {
  const registry = providers.registry as any;
  afterEach(() => { registry.testMode = undefined; });

  test('a sandbox "verified" result is shown but never verifies the document or changes its dates', async () => {
    registry.testMode = true;
    const { doc, post } = await fixture();
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.data.result).toMatchObject({ outcome: 'verified', testMode: true });
    expect(res.body.data.result.message).toMatch(/^TEST RESULT ONLY/);
    const stored = await DocumentModel.findById(doc!._id).lean();
    expect(stored).toMatchObject({ verified: false, verificationSource: null, lastUpdatedBy: 'owner' });
    expect(stored!.expiryDate!.toISOString()).toBe(new Date('2090-01-01').toISOString());
  });

  test('a sandbox "not found" result never clears an existing provider certification', async () => {
    registry.testMode = true;
    lookup.mockImplementation(async (reg) => activeRecord(reg, { found: false, status: 'unknown' }));
    const { doc, post } = await fixture();
    await DocumentModel.updateOne({ _id: doc!._id }, { verified: true, verificationSource: 'provider', lastUpdatedBy: 'provider' });
    const res = await post();
    expect(res.body.data.result).toMatchObject({ outcome: 'not_found', testMode: true });
    expect(await DocumentModel.findById(doc!._id).lean()).toMatchObject({ verified: true, verificationSource: 'provider' });
  });

  test('a cached sandbox result is not reused once the server is on live keys', async () => {
    registry.testMode = true;
    const { post } = await fixture();
    await post();
    registry.testMode = false;
    const res = await post();
    expect(res.body.data.cached).toBe(false);
    expect(res.body.data.result.testMode).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
