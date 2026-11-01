/**
 * Transfer paperwork API: who can see and change what, encryption at rest, the sale-date
 * confirmation flow, reminders that never go stale, key loss and rotation, and retention.
 */

import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import mainRouter from '../routes/index';
import { errorHandler } from '../middleware/errorHandler';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Booking } from '../models/Booking';
import { Challan } from '../models/Challan';
import { Reminder } from '../models/Reminder';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { TransferPaperwork } from '../models/TransferPaperwork';
import { PaperworkAudit } from '../models/PaperworkAudit';
import { TwinShare } from '../models/TwinShare';
import { generateAccessToken } from '../services/tokenService';
import { verifyLedger } from '../services/transfer.service';
import { parseKeyring, setKeyring } from '../services/fieldCrypto';
import { keyUsage } from '../services/paperworkFields';
import { reencryptPaperwork } from '../services/paperworkMaintenance';
import { runPaperworkRetention } from '../services/transferPaperwork.service';
import { todayIST } from '../services/paperworkValidation';
import { addDaysYmd } from '../services/transferPaperwork.service';
import { runDueRemindersJob } from '../controllers/reminderController';

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
  setKeyring(null);
  await Promise.all(
    [User, Vehicle, Booking, Challan, Reminder, OwnershipTransfer, TransferPaperwork, PaperworkAudit, TwinShare].map((m) =>
      (m as any).deleteMany({})
    )
  );
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

let counter = 0;
const makeOwner = (label: string, state = 'Delhi') => {
  counter++;
  return User.create({
    name: `${label} Account`,
    email: `${label.toLowerCase()}${counter}@test.com`,
    phone: '9999999999',
    passwordHash: 'x',
    role: 'owner',
    address: { city: 'Somewhere', state, pincode: '110001' }
  });
};

const bearer = (u: any) => `Bearer ${generateAccessToken({ userId: u._id.toString(), email: u.email, role: u.role })}`;
const twin = (u: any) => ({
  get: (url: string) => request(app).get(`/api/v1/twin${url}`).set('Authorization', bearer(u)),
  put: (url: string, body?: any) => request(app).put(`/api/v1/twin${url}`).set('Authorization', bearer(u)).send(body),
  post: (url: string, body?: any) => request(app).post(`/api/v1/twin${url}`).set('Authorization', bearer(u)).send(body),
  del: (url: string) => request(app).delete(`/api/v1/twin${url}`).set('Authorization', bearer(u))
});

const SELLER_PARTY = {
  fullName: 'Asha Verma',
  guardianName: 'Mohan Verma',
  relation: 'D/o',
  mobile: '9876543210',
  idType: 'pan',
  idLast4: 'X4M1',
  address: { line1: '12 Park Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }
};
const BUYER_PARTY = {
  fullName: 'Ravi Kumar',
  guardianName: 'Suresh Kumar',
  relation: 'S/o',
  mobile: '9812345678',
  idType: 'pan',
  idLast4: 'Z9K2',
  address: { line1: '44 Gandhi Lane', city: 'New Delhi', state: 'Delhi', pincode: '110002' }
};
const SELLER_FACTS = {
  vehicle: { chassisNo: 'MA3ABC123456789', engineNo: 'K12M-7654321', colour: 'White', registrationDate: '2019-06-12' },
  sale: { price: 450000, odometerKm: 48500 },
  loan: { hypothecated: false },
  insurance: { insurerName: 'Acme General', policyNumber: 'POL-4455-A' }
};

/** A registered MH vehicle, a seller, a buyer who lives in Delhi, and a stranger. */
const setup = async () => {
  const seller = await makeOwner('Seller', 'Maharashtra');
  const buyer = await makeOwner('Buyer');
  const stranger = await makeOwner('Stranger');
  const vehicle = await Vehicle.create({
    ownerId: seller._id, regNumber: `MH12AB${1000 + counter}`, type: 'car', fuelType: 'petrol',
    make: 'Honda', model: 'City', year: 2019, qrCodeId: `qr-${counter}`
  });

  const created = await twin(seller).post('/transfers', { vehicleId: vehicle._id });
  const token = created.body.data.token;
  const transferId: string = created.body.data.transferId;

  const requested = async () => {
    await twin(buyer).post('/transfers/request', { token });
  };
  const accepted = async () => {
    await requested();
    const res = await twin(seller).post(`/transfers/${transferId}/approve`);
    expect(res.status).toBe(200);
  };
  return { seller, buyer, stranger, vehicle, token, transferId, requested, accepted };
};

const strip = (v: unknown) => JSON.stringify(v);
const today = () => todayIST();

// ── Access ────────────────────────────────────────────────────────────────────

describe('who can reach the paperwork', () => {
  it('answers 404 to anyone who is not a party, and to a bad id, on every endpoint', async () => {
    const t = await setup();
    await t.accepted();
    const s = twin(t.stranger);

    const calls = [
      await s.get(`/transfers/${t.transferId}/paperwork`),
      await s.put(`/transfers/${t.transferId}/paperwork`, { party: { fullName: 'Mallory Evil' } }),
      await s.del(`/transfers/${t.transferId}/paperwork/me`),
      await s.post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() }),
      await s.put(`/transfers/${t.transferId}/checklist/buyer_form30_submit`, { status: 'done' }),
      await s.get('/transfers/not-an-id/paperwork')
    ];
    for (const res of calls) expect(res.status).toBe(404);
    expect(await TransferPaperwork.countDocuments({})).toBeLessThanOrEqual(1); // nothing written by the stranger
  });

  it('needs a login', async () => {
    const t = await setup();
    const res = await request(app).get(`/api/v1/twin/transfers/${t.transferId}/paperwork`);
    expect(res.status).toBe(401);
  });

  it('is not available before a buyer has applied', async () => {
    const t = await setup();
    const res = await twin(t.seller).get(`/transfers/${t.transferId}/paperwork`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_AVAILABLE');
  });

  it('is not available once the buyer request has expired', async () => {
    const t = await setup();
    await t.requested();
    await OwnershipTransfer.updateOne({ _id: t.transferId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await twin(t.seller).get(`/transfers/${t.transferId}/paperwork`)).status).toBe(409);
    expect((await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: { fullName: 'Ravi Kumar' } })).status).toBe(409);
  });
});

describe('what each party sees before approval', () => {
  it("keeps the seller's details and the sale from the buyer", async () => {
    const t = await setup();
    await t.requested();
    const saved = await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { party: SELLER_PARTY, ...SELLER_FACTS, sale: { ...SELLER_FACTS.sale, date: today() } });
    expect(saved.status).toBe(200);

    const buyerView = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    expect(buyerView.status).toBe(200);
    const text = strip(buyerView.body);
    for (const secret of ['Asha', 'Verma', 'Park Road', '9876543210', 'X4M1', 'MA3ABC123456789', 'K12M', 'POL-4455', 'Acme General', '450000', '48500']) {
      expect(text).not.toContain(secret);
    }
    expect(buyerView.body.data.counterparty).toBeUndefined();
    expect(buyerView.body.data.checklist).toBeUndefined();
    expect(buyerView.body.data.vehicle.regNumber).toContain('••••'); // plate masked
  });

  it("does not show the buyer's details to the seller", async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });

    const sellerView = await twin(t.seller).get(`/transfers/${t.transferId}/paperwork`);
    const text = strip(sellerView.body);
    for (const secret of ['Ravi', 'Kumar', 'Gandhi Lane', '9812345678', 'Z9K2']) expect(text).not.toContain(secret);
    expect(sellerView.body.data.counterparty).toBeUndefined();
  });

  it('stops the buyer writing seller-only details', async () => {
    const t = await setup();
    await t.requested();
    const res = await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { sale: { price: 1 }, vehicle: { chassisNo: 'ABCDEF123' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FIELD_NOT_ALLOWED');
    expect(res.body.forbidden.sort()).toEqual(['sale', 'vehicle']);
    expect(await TransferPaperwork.countDocuments({ 'vehicle.chassisNo': { $exists: true } })).toBe(0);
  });

  it('refuses a full ID number and never stores more than four characters', async () => {
    const t = await setup();
    await t.requested();
    const res = await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: { idType: 'aadhaar', idLast4: '123456789012' } });
    expect(res.status).toBe(400);
    expect(res.body.errors['party.idLast4']).toBeDefined();
    expect(await TransferPaperwork.countDocuments({})).toBe(0);
  });

  it('lets the buyer fill their own details while the request is open', async () => {
    const t = await setup();
    await t.requested();
    const res = await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY, insurance: { buyerPlan: 'transfer' } });
    expect(res.status).toBe(200);
    expect(res.body.data.me.fullName).toBe('Ravi Kumar');
    expect(res.body.data.noc.result).toBe('likely'); // MH vehicle, buyer in Delhi
    expect(res.body.data.noc.reason).toContain('Maharashtra');
    expect(res.body.data.noc.reason).toContain('Delhi');
  });
});

describe('what each party sees after approval', () => {
  it('shows only name, mobile and city/state of the other person', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { party: SELLER_PARTY, ...SELLER_FACTS });
    await twin(t.seller).post(`/transfers/${t.transferId}/approve`);

    const buyerView = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    expect(Object.keys(buyerView.body.data.counterparty).sort()).toEqual(['city', 'fullName', 'mobile', 'state']);
    expect(buyerView.body.data.counterparty.fullName).toBe('Asha Verma');
    const buyerText = strip(buyerView.body);
    for (const secret of ['X4M1', '12 Park Road', 'Mohan Verma', '400001']) expect(buyerText).not.toContain(secret);

    const sellerView = await twin(t.seller).get(`/transfers/${t.transferId}/paperwork`);
    expect(sellerView.body.data.counterparty.fullName).toBe('Ravi Kumar');
    const sellerText = strip(sellerView.body);
    for (const secret of ['Z9K2', '44 Gandhi Lane', 'Suresh Kumar', '110002']) expect(sellerText).not.toContain(secret);
  });

  it('is refused once a transfer was rejected or cancelled, and the paperwork is deleted', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    expect(await TransferPaperwork.countDocuments({})).toBe(1);

    expect((await twin(t.seller).post(`/transfers/${t.transferId}/reject`)).status).toBe(200);
    expect(await TransferPaperwork.countDocuments({})).toBe(0);
    expect((await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: { fullName: 'Ravi Kumar' } })).status).toBe(409);
    expect((await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`)).status).toBe(409);
  });

  it('deletes the paperwork when the seller cancels or makes a new QR', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    expect(await TransferPaperwork.countDocuments({})).toBe(1);
    await twin(t.seller).post('/transfers', { vehicleId: t.vehicle._id }); // new QR supersedes the old transfer
    expect(await TransferPaperwork.countDocuments({})).toBe(0);

    const t2 = await setup();
    await t2.requested();
    await twin(t2.buyer).put(`/transfers/${t2.transferId}/paperwork`, { party: BUYER_PARTY });
    await twin(t2.seller).post(`/transfers/${t2.transferId}/cancel`);
    expect(await TransferPaperwork.countDocuments({ transferId: t2.transferId })).toBe(0);
  });
});

// ── Approval must not depend on paperwork ─────────────────────────────────────

describe('approval', () => {
  it('works with no paperwork at all, and the ledger stays intact', async () => {
    const t = await setup();
    await t.accepted();
    const v = await Vehicle.findById(t.vehicle._id);
    expect(v!.ownerId.toString()).toBe(t.buyer._id.toString());
    expect((await verifyLedger(t.vehicle._id.toString())).intact).toBe(true);
  });

  it('works when the buyer already filled in their details', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    expect((await twin(t.seller).post(`/transfers/${t.transferId}/approve`)).status).toBe(200);
    expect((await verifyLedger(t.vehicle._id.toString())).intact).toBe(true);
    expect((await OwnershipTransfer.findById(t.transferId))!.snapshot.ownershipIndex).toBe(1);
  });
});

// ── Encryption and the audit trail ────────────────────────────────────────────

describe('personal data at rest', () => {
  it('is never stored as plain text', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { party: SELLER_PARTY, ...SELLER_FACTS, loan: { hypothecated: true, bankName: 'Acme Bank' } });

    const raw = await TransferPaperwork.collection.findOne({ transferId: new mongoose.Types.ObjectId(t.transferId) });
    const text = strip(raw);
    for (const secret of ['Asha', 'Verma', '12 Park Road', 'Mumbai', '400001', '9876543210', 'X4M1', 'Ravi', 'Gandhi Lane', '9812345678', 'Z9K2',
      'MA3ABC123456789', 'K12M-7654321', 'POL-4455-A', 'Acme Bank']) {
      expect(text).not.toContain(secret);
    }
    // ...but what the checks need is readable
    expect(raw!.seller.address.state).toBe('Maharashtra');
    expect(raw!.buyer.address.state).toBe('Delhi');
    expect(raw!.sale.price).toBe(450000);
  });

  it('records who did what, by field name only', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);

    const rows = await PaperworkAudit.find({ transferId: t.transferId }).lean();
    expect(rows.map((r) => r.action).sort()).toEqual(['update', 'view']);
    const update = rows.find((r) => r.action === 'update')!;
    expect(update.fields).toEqual(expect.arrayContaining(['buyer.fullName', 'buyer.address.line1', 'buyer.idLast4']));
    expect(update.role).toBe('buyer');
    const text = strip(rows);
    for (const secret of ['Ravi', 'Kumar', 'Gandhi', '9812345678', 'Z9K2']) expect(text).not.toContain(secret);
  });

  it('answers 503 and logs it, rather than crashing, when the key is gone', async () => {
    const t = await setup();
    await t.requested();
    const keyA = crypto.createHash('sha256').update('a').digest('base64');
    const keyB = crypto.createHash('sha256').update('b').digest('base64');
    setKeyring(parseKeyring(`a:${keyA}`, 'a', 'test'));
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });

    setKeyring(parseKeyring(`b:${keyB}`, 'b', 'test')); // key "a" lost
    const res = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAPERWORK_UNAVAILABLE');
    expect(strip(res.body)).not.toContain('Ravi');
    expect(await PaperworkAudit.countDocuments({ transferId: t.transferId, action: 'decrypt_failed' })).toBe(1);

    // Deleting and re-entering works
    await twin(t.seller).post(`/transfers/${t.transferId}/approve`);
    expect((await twin(t.buyer).del(`/transfers/${t.transferId}/paperwork/me`)).status).toBe(200);
    expect((await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY })).status).toBe(200);
  });

  it('rotates keys: old data stays readable, re-encrypting moves it, and the old key can then go', async () => {
    const t = await setup();
    await t.requested();
    const keyA = crypto.createHash('sha256').update('a').digest('base64');
    const keyB = crypto.createHash('sha256').update('b').digest('base64');
    setKeyring(parseKeyring(`a:${keyA}`, 'a', 'test'));
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });

    setKeyring(parseKeyring(`a:${keyA},b:${keyB}`, 'b', 'test'));
    expect((await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`)).body.data.me.fullName).toBe('Ravi Kumar');

    const dry = await reencryptPaperwork({ dryRun: true });
    expect(dry.needingMigration).toBe(1);
    expect(dry.migrated).toBe(0);
    expect(Object.keys(dry.valuesByKey)).toEqual(['a']);

    const run = await reencryptPaperwork();
    expect(run.migrated).toBe(1);
    const stored = await TransferPaperwork.collection.findOne({ transferId: new mongoose.Types.ObjectId(t.transferId) });
    expect(Object.keys(keyUsage(stored!))).toEqual(['b']);

    const again = await reencryptPaperwork();
    expect(again.needingMigration).toBe(0); // idempotent

    setKeyring(parseKeyring(`b:${keyB}`, 'b', 'test')); // retire key "a"
    expect((await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`)).body.data.me.fullName).toBe('Ravi Kumar');
  });
});

// ── Sale date and deadlines ───────────────────────────────────────────────────

describe('sale date confirmation', () => {
  const dueOf = (view: any, key: string) => view.body.data.checklist.find((s: any) => s.key === key);

  it('shows no deadline until the seller enters a date and the buyer confirms it', async () => {
    const t = await setup();
    await t.accepted();

    let buyerView = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    expect(dueOf(buyerView, 'buyer_insurance_transfer').dueAt).toBeNull();
    expect(dueOf(buyerView, 'buyer_insurance_transfer').dueNote).toBe('Sale date required');

    expect((await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() })).body.code).toBe('NO_DATE');

    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    buyerView = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    expect(dueOf(buyerView, 'buyer_insurance_transfer').dueAt).toBeNull();
    expect(dueOf(buyerView, 'buyer_insurance_transfer').dueNote).toBe('Confirm the sale date to see this deadline');
    expect(buyerView.body.data.saleDate).toEqual(expect.objectContaining({ value: today(), confirmed: false }));

    const confirmed = await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.saleDate.confirmed).toBe(true);
    const due = dueOf(confirmed, 'buyer_insurance_transfer').dueAt;
    expect(due).toBe(new Date(`${addDaysYmd(today(), 14)}T23:59:59.999+05:30`).toISOString());
  });

  it('never uses the approval date as the sale date', async () => {
    const t = await setup();
    await t.accepted();
    const view = await twin(t.seller).get(`/transfers/${t.transferId}/paperwork`);
    expect(view.body.data.saleDate.value).toBeNull();
    for (const step of view.body.data.checklist) expect(step.dueAt).toBeNull();
  });

  it('only the buyer confirms, and only the date they were shown', async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });

    expect((await twin(t.seller).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() })).status).toBe(403);
    const wrong = await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: addDaysYmd(today(), -3) });
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('DATE_CHANGED');
    expect((await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: 'tomorrow' })).status).toBe(400);
  });

  it('cannot be confirmed before approval', async () => {
    const t = await setup();
    await t.requested();
    const res = await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    expect(res.body.code).toBe('NOT_AVAILABLE');
  });

  it('refuses a sale date in the future or before the registration date', async () => {
    const t = await setup();
    await t.accepted();
    expect((await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: addDaysYmd(today(), 2) } })).status).toBe(400);

    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { vehicle: { registrationDate: '2024-01-01' } });
    const res = await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: '2023-12-31' } });
    expect(res.status).toBe(400);
    expect(res.body.errors['sale.date']).toMatch(/before the registration date/);
  });
});

describe('reminders', () => {
  const rows = (transferId: string) => Reminder.find({ transferId, kind: 'transfer' }).lean();

  it('sends only a "enter the sale date" nudge to the seller until a date exists', async () => {
    const t = await setup();
    await t.accepted();
    const list = await rows(t.transferId);
    expect(list).toHaveLength(1);
    expect(list[0].taskKey).toBe('confirm_sale_date');
    expect(list[0].ownerId.toString()).toBe(t.seller._id.toString());
  });

  it('then nudges the buyer to confirm, and sets due-date reminders only after confirmation', async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });

    let list = await rows(t.transferId);
    expect(list).toHaveLength(1);
    expect(list[0].taskKey).toBe('confirm_sale_date');
    expect(list[0].ownerId.toString()).toBe(t.buyer._id.toString());

    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    list = await rows(t.transferId);
    expect(list.some((r) => r.taskKey === 'confirm_sale_date')).toBe(false);
    expect(list.filter((r) => r.taskKey === 'buyer_insurance_transfer')).toHaveLength(3);
    expect(list.filter((r) => r.taskKey === 'seller_insurance_ncb')).toHaveLength(3);
    expect(list.filter((r) => r.taskKey === 'buyer_insurance_transfer').every((r) => r.ownerId.toString() === t.buyer._id.toString())).toBe(true);
    expect(list.every((r) => r.anchorDate === today())).toBe(true);
  });

  it('drops every due-date reminder, in the same request, when the seller changes a confirmed date', async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    expect((await rows(t.transferId)).length).toBeGreaterThan(1);

    const res = await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: addDaysYmd(today(), -1) } });

    expect(res.status).toBe(200);
    expect(res.body.data.saleDate.confirmed).toBe(false);
    for (const step of res.body.data.checklist) expect(step.dueAt).toBeNull();
    const list = await rows(t.transferId);
    expect(list).toHaveLength(1);
    expect(list[0].taskKey).toBe('confirm_sale_date');
    expect(list[0].ownerId.toString()).toBe(t.buyer._id.toString());
  });

  it('keeps the confirmation when the date is saved again unchanged', async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    const before = (await rows(t.transferId)).length;

    const res = await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today(), price: 500000 } });

    expect(res.body.data.saleDate.confirmed).toBe(true);
    expect((await rows(t.transferId)).length).toBe(before);
  });

  it('does not send a stale reminder that survived a date change, and removes it', async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });

    const stale = await Reminder.create({
      kind: 'transfer', transferId: t.transferId, taskKey: 'buyer_insurance_transfer', anchorDate: '2000-01-01',
      vehicleId: t.vehicle._id, ownerId: t.buyer._id, scheduledFor: new Date(Date.now() - 1000),
      thresholdDays: 2, message: 'STALE', sent: false
    });
    const fresh = await Reminder.create({
      kind: 'transfer', transferId: t.transferId, taskKey: 'buyer_insurance_transfer', anchorDate: today(),
      vehicleId: t.vehicle._id, ownerId: t.buyer._id, scheduledFor: new Date(Date.now() + 86_400_000),
      thresholdDays: 2, message: 'FRESH', sent: false
    });

    await runDueRemindersJob();

    expect(await Reminder.findById(stale._id)).toBeNull();
    expect(await Reminder.findById(fresh._id)).not.toBeNull(); // not due yet, left alone
  });

  it('stops reminding about a step once it is done', async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    expect((await rows(t.transferId)).filter((r) => r.taskKey === 'buyer_insurance_transfer')).toHaveLength(3);

    const res = await twin(t.buyer).put(`/transfers/${t.transferId}/checklist/buyer_insurance_transfer`, { status: 'done' });

    expect(res.status).toBe(200);
    expect((await rows(t.transferId)).filter((r) => r.taskKey === 'buyer_insurance_transfer')).toHaveLength(0);
    expect((await rows(t.transferId)).filter((r) => r.taskKey === 'seller_insurance_ncb')).toHaveLength(3);
  });

  it("is not handed to the next owner when the vehicle is sold again, and the buyer never sees the seller's reminders", async () => {
    const t = await setup();
    await t.accepted();
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });

    const third = await makeOwner('Third');
    const second = await twin(t.buyer).post('/transfers', { vehicleId: t.vehicle._id });
    await twin(third).post('/transfers/request', { token: second.body.data.token });
    expect((await twin(t.buyer).post(`/transfers/${second.body.data.transferId}/approve`)).status).toBe(200);

    const first = await rows(t.transferId);
    const owners = new Set(first.map((r) => r.ownerId.toString()));
    expect(owners.has(third._id.toString())).toBe(false);
    expect(owners).toEqual(new Set([t.seller._id.toString(), t.buyer._id.toString()]));

    const detail = await request(app).get(`/api/v1/vehicles/${t.vehicle._id}`).set('Authorization', bearer(third));
    expect(detail.status).toBe(200);
    expect(detail.body.data.reminders.every((r: any) => r.kind !== 'transfer')).toBe(true);
  });
});

// ── Checklist ─────────────────────────────────────────────────────────────────

describe('checklist', () => {
  it('lets each person mark only their own steps, done or skipped, and undo it', async () => {
    const t = await setup();
    await t.accepted();
    const path = (key: string) => `/transfers/${t.transferId}/checklist/${key}`;

    expect((await twin(t.buyer).put(path('seller_form29_submit'), { status: 'done' })).status).toBe(404);
    expect((await twin(t.seller).put(path('buyer_form30_submit'), { status: 'done' })).status).toBe(404);
    expect((await twin(t.buyer).put(path('no_such_step'), { status: 'done' })).status).toBe(404);

    const done = await twin(t.buyer).put(path('buyer_form30_submit'), { status: 'done' });
    expect(done.body.data.checklist.find((s: any) => s.key === 'buyer_form30_submit').status).toBe('done');

    const skipped = await twin(t.buyer).put(path('buyer_noc_form28'), { status: 'skipped' });
    expect(skipped.body.data.checklist.find((s: any) => s.key === 'buyer_noc_form28').status).toBe('skipped');

    const undone = await twin(t.buyer).put(path('buyer_form30_submit'), { status: null });
    expect(undone.body.data.checklist.find((s: any) => s.key === 'buyer_form30_submit').status).toBe('open');

    expect((await twin(t.buyer).put(path('buyer_form30_submit'), { status: 'maybe' })).status).toBe(400);
  });

  it('only has the lender step when the vehicle is under a loan', async () => {
    const t = await setup();
    await t.accepted();
    const path = `/transfers/${t.transferId}/checklist/seller_loan_noc`;
    expect((await twin(t.seller).put(path, { status: 'done' })).status).toBe(404);

    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { loan: { hypothecated: true, bankName: 'Acme Bank' } });
    expect((await twin(t.seller).put(path, { status: 'done' })).status).toBe(200);
  });

  it('explains the NOC with a reason and does not call it required', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await twin(t.seller).post(`/transfers/${t.transferId}/approve`);

    const view = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    const noc = view.body.data.checklist.find((s: any) => s.key === 'buyer_noc_form28');
    expect(noc.why).toContain('Maharashtra');
    expect(noc.why).toContain('Delhi');
    expect(noc.why.toLowerCase()).not.toContain('required');
    expect(noc.optional).toBe(false);
    expect(strip(view.body).toLowerCase()).not.toMatch(/noc[^."]{0,40}(is|are) required/);

    // Moving to the vehicle's own state changes the guidance
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: { address: { state: 'Maharashtra' } } });
    const same = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    const nocSame = same.body.data.checklist.find((s: any) => s.key === 'buyer_noc_form28');
    expect(nocSame.optional).toBe(true);
    expect(nocSame.why).toMatch(/some RTOs still ask/);
  });

  it('reports paperwork progress in the transfers list, with no date until the sale date is confirmed', async () => {
    const t = await setup();
    await t.accepted();

    const before = await twin(t.buyer).get('/transfers');
    const entry = before.body.data.find((x: any) => x._id === t.transferId);
    expect(entry.openTasks).toBeGreaterThan(0);
    expect(entry.nextDue).toBeNull();

    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { sale: { date: today() } });
    await twin(t.buyer).post(`/transfers/${t.transferId}/sale-date/confirm`, { date: today() });
    const after = await twin(t.buyer).get('/transfers');
    expect(after.body.data.find((x: any) => x._id === t.transferId).nextDue).not.toBeNull();
  });
});

// ── Deleting and retention ────────────────────────────────────────────────────

describe('deleting personal details', () => {
  it('wipes only the caller\'s own details and keeps the checklist and audit trail', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await twin(t.seller).put(`/transfers/${t.transferId}/paperwork`, { party: SELLER_PARTY, ...SELLER_FACTS });
    await twin(t.seller).post(`/transfers/${t.transferId}/approve`);
    await twin(t.buyer).put(`/transfers/${t.transferId}/checklist/buyer_form30_submit`, { status: 'done' });

    expect((await twin(t.seller).del(`/transfers/${t.transferId}/paperwork/me`)).status).toBe(200);

    const raw: any = await TransferPaperwork.collection.findOne({ transferId: new mongoose.Types.ObjectId(t.transferId) });
    expect(raw.seller).toBeUndefined();
    expect(raw.vehicle?.chassisNo).toBeUndefined();
    expect(raw.insurance?.policyNumber).toBeUndefined();
    expect(raw.buyer.fullName).toBeDefined(); // the buyer's details are theirs to delete
    expect(raw.steps).toHaveLength(1);
    expect(await PaperworkAudit.countDocuments({ transferId: t.transferId, action: 'delete_my_details' })).toBe(1);

    const view = await twin(t.buyer).get(`/transfers/${t.transferId}/paperwork`);
    expect(view.body.data.counterparty.fullName).toBeNull();
  });

  it('is refused before approval', async () => {
    const t = await setup();
    await t.requested();
    expect((await twin(t.buyer).del(`/transfers/${t.transferId}/paperwork/me`)).status).toBe(409);
  });
});

describe('retention job', () => {
  const snapshot = { score: 0, verifiedDocTypes: [], completedServiceCount: 0, violationCount: 0, ownershipIndex: 1 };

  it('deletes paperwork for transfers that never completed and wipes old finished ones', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await OwnershipTransfer.updateOne({ _id: t.transferId }, { $set: { expiresAt: new Date(Date.now() - 1000) } }); // never approved in time

    const done = await setup();
    await done.accepted();
    await twin(done.seller).put(`/transfers/${done.transferId}/paperwork`, { party: SELLER_PARTY, ...SELLER_FACTS });
    await twin(done.seller).put(`/transfers/${done.transferId}/checklist/seller_form29_submit`, { status: 'done' });
    await OwnershipTransfer.updateOne({ _id: done.transferId }, { $set: { acceptedAt: new Date(Date.now() - 400 * 86_400_000) } });

    const recent = await setup();
    await recent.accepted();
    await twin(recent.seller).put(`/transfers/${recent.transferId}/paperwork`, { party: SELLER_PARTY });

    const result = await runPaperworkRetention();

    expect(result).toEqual({ deleted: 1, wiped: 1 });
    expect(await TransferPaperwork.countDocuments({ transferId: t.transferId })).toBe(0);
    const old: any = await TransferPaperwork.collection.findOne({ transferId: new mongoose.Types.ObjectId(done.transferId) });
    expect(old.seller).toBeUndefined();
    expect(old.personalDataClearedAt).toBeTruthy();
    expect(old.steps).toHaveLength(1);
    const keep: any = await TransferPaperwork.collection.findOne({ transferId: new mongoose.Types.ObjectId(recent.transferId) });
    expect(keep.seller.fullName).toBeDefined();
    expect(await PaperworkAudit.countDocuments({ action: 'purge' })).toBeGreaterThanOrEqual(2);
  });

  it('removes the paperwork of a rejected transfer that somehow kept it', async () => {
    const t = await setup();
    await t.requested();
    await twin(t.buyer).put(`/transfers/${t.transferId}/paperwork`, { party: BUYER_PARTY });
    await OwnershipTransfer.updateOne({ _id: t.transferId }, { $set: { status: 'rejected' } }); // bypasses the endpoint's cleanup
    expect(await TransferPaperwork.countDocuments({})).toBe(1);

    await runPaperworkRetention();

    expect(await TransferPaperwork.countDocuments({})).toBe(0);
  });
});
