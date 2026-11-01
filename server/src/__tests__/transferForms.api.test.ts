/**
 * Preparation worksheets: what they say, that they never pose as the official forms, that PDF
 * generation survives odd input, and that the download is authenticated (no links to forward).
 */

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
import {
  buildForm29Model,
  buildForm30Model,
  buildInsurerLetterModel,
  renderWorksheet,
  pdfSafe,
  WORKSHEET_DISCLAIMER,
  WorksheetContext,
  Worksheet
} from '../services/formPdfService';
import { ENV } from '../config/env';

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
    [User, Vehicle, Booking, Challan, Reminder, OwnershipTransfer, TransferPaperwork, PaperworkAudit, TwinShare].map((m) =>
      (m as any).deleteMany({})
    )
  );
});

// ── Content model ─────────────────────────────────────────────────────────────

const ctx = (data: any = {}): WorksheetContext => ({
  transferId: '65a1b2c3d4e5f60718293a4b',
  generatedAt: new Date('2026-11-10T04:30:00Z'),
  officialFormsUrl: 'https://parivahan.gov.in/en/forms-all',
  vehicle: { regNumber: 'MH12AB1234', make: 'Honda', model: 'City', year: 2019, fuelType: 'petrol', registrationState: 'Maharashtra' },
  data
});

const FULL = {
  seller: {
    fullName: 'Asha Verma', guardianName: 'Mohan Verma', relation: 'D/o', mobile: '9876543210', idType: 'pan', idLast4: 'X4M1',
    address: { line1: '12 Park Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }
  },
  buyer: {
    fullName: 'Ravi Kumar', guardianName: 'Suresh Kumar', relation: 'S/o', mobile: '9812345678', email: 'ravi@example.com', idType: 'aadhaar', idLast4: '4321',
    address: { line1: '44 Gandhi Lane', city: 'New Delhi', state: 'Delhi', pincode: '110002' }
  },
  vehicle: { chassisNo: 'MA3ABC123456789', engineNo: 'K12M-7654321', colour: 'White', registrationDate: '2019-06-12' },
  sale: { date: '2026-11-01', price: 450000, odometerKm: 48500, dateConfirmedAt: new Date() },
  loan: { hypothecated: true, bankName: 'Acme Bank' },
  insurance: { insurerName: 'Acme General', policyNumber: 'POL-4455-A' }
};

const textOf = (ws: Worksheet): string =>
  JSON.stringify(ws.blocks) + ws.title;
const valueOf = (ws: Worksheet, label: string): string | null | undefined => {
  for (const b of ws.blocks) if (b.type === 'fields') for (const r of b.rows) if (r.label === label) return r.value;
  return undefined;
};

describe('worksheet content', () => {
  it('is titled as a worksheet or a draft, never as the form itself', () => {
    expect(buildForm29Model(ctx()).title).toBe('Form 29 preparation worksheet');
    expect(buildForm30Model(ctx()).title).toBe('Form 30 preparation worksheet');
    expect(buildInsurerLetterModel(ctx()).title).toBe('Insurer transfer request (draft letter)');
  });

  it.each([
    ['form 29', buildForm29Model],
    ['form 30', buildForm30Model],
    ['insurer letter', buildInsurerLetterModel]
  ])('%s carries the warning and the link to the official forms', (_name, build) => {
    const ws = build(ctx(FULL));
    expect(ws.disclaimer).toBe(WORKSHEET_DISCLAIMER);
    expect(ws.disclaimer).toMatch(/NOT the official form/);
    expect(ws.officialFormsUrl).toBe('https://parivahan.gov.in/en/forms-all');
  });

  it('puts the right people and details on Form 29', () => {
    const ws = buildForm29Model(ctx(FULL));
    const text = textOf(ws);
    for (const s of ['Asha Verma', '12 Park Road', '9876543210', 'PAN: XXXX-X4M1', 'Ravi Kumar', '44 Gandhi Lane', 'MA3ABC123456789', 'K12M-7654321', '01/11/2026', '48,500', 'Acme Bank']) {
      expect(text).toContain(s);
    }
    // data minimisation: the buyer's ID and contact details are not the seller's business
    for (const s of ['XXXX-4321', 'Aadhaar', '9812345678', 'ravi@example.com']) expect(text).not.toContain(s);
    expect(text).not.toMatch(/named in [A-E]\b/); // headings are not lettered, so nothing may point at a letter
  });

  it('puts the right people and details on Form 30', () => {
    const ws = buildForm30Model(ctx(FULL));
    const text = textOf(ws);
    for (const s of ['Ravi Kumar', '9812345678', 'ravi@example.com', 'Aadhaar: XXXX-4321', 'Asha Verma', '12 Park Road', 'Acme Bank']) {
      expect(text).toContain(s);
    }
    for (const s of ['X4M1', '9876543210']) expect(text).not.toContain(s);
  });

  it('only ever shows the last four characters of an ID', () => {
    for (const ws of [buildForm29Model(ctx(FULL)), buildForm30Model(ctx(FULL))]) {
      expect(textOf(ws)).toMatch(/XXXX-[A-Z0-9]{4}/);
      expect(textOf(ws)).not.toMatch(/\d{8,}\D*XXXX/);
    }
  });

  it('always has an optional Form 28 line, and leaves it blank for the person to fill', () => {
    expect(valueOf(buildForm30Model(ctx(FULL)), 'Form 28 NOC number and date, if applicable')).toBeNull();
    expect(valueOf(buildForm30Model(ctx()), 'Form 28 NOC number and date, if applicable')).toBeNull();
    expect(textOf(buildForm30Model(ctx(FULL))).toLowerCase()).not.toMatch(/noc[^"]{0,30}required/);
  });

  it('marks a sale date the buyer has not confirmed', () => {
    const unconfirmed = ctx({ ...FULL, sale: { ...FULL.sale, dateConfirmedAt: null } });
    expect(valueOf(buildForm29Model(unconfirmed), 'Date of sale / handover')).toBe('01/11/2026 (not yet confirmed by both parties)');
    expect(valueOf(buildForm29Model(ctx(FULL)), 'Date of sale / handover')).toBe('01/11/2026');
    expect(valueOf(buildForm29Model(ctx({ ...FULL, sale: {} })), 'Date of sale / handover')).toBeNull();
  });

  it('builds a letter that names the policy, the vehicle and both people', () => {
    const text = textOf(buildInsurerLetterModel(ctx(FULL)));
    for (const s of ['POL-4455-A', 'MH12AB1234', 'Ravi Kumar', 'Asha Verma', 'Acme General']) expect(text).toContain(s);
  });

  it('leaves blanks, not guesses, when details are missing', () => {
    const ws = buildForm29Model(ctx());
    expect(valueOf(ws, 'Chassis number')).toBeUndefined();
    const text = textOf(buildInsurerLetterModel(ctx()));
    expect(text).toContain('__________');
  });
});

describe('PDF rendering', () => {
  const render = (ws: Worksheet) => renderWorksheet(ws, { transferId: 'abc', generatedAt: new Date() });

  it.each([
    ['form 29', buildForm29Model],
    ['form 30', buildForm30Model],
    ['insurer letter', buildInsurerLetterModel]
  ])('%s produces a PDF even with no details at all', async (_n, build) => {
    const pdf = await render(build(ctx()));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('survives characters the built-in fonts cannot draw', async () => {
    const odd = ctx({
      ...FULL,
      seller: { ...FULL.seller, fullName: 'आशा वर्मा Café ₹ “quoted” — dash', address: { line1: 'मकान 12, Straße 5', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' } },
      sale: { ...FULL.sale, price: 450000 }
    });
    for (const build of [buildForm29Model, buildForm30Model, buildInsurerLetterModel]) {
      const pdf = await render(build(odd));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('spills long content onto more pages instead of failing', async () => {
    const long = 'A very long street name '.repeat(80);
    const ws = buildForm29Model(ctx({ ...FULL, seller: { ...FULL.seller, address: { line1: long, city: 'Mumbai', state: 'Maharashtra', pincode: '400001' } } }));
    const small = await render(buildForm29Model(ctx()));
    const big = await render(ws);
    expect(big.length).toBeGreaterThan(small.length);
  });

  it.each([
    ['₹ 450000', 'Rs. 450000'],
    ['Café', 'Cafe'],
    ['“hi” – ok', '"hi" - ok'],
    ['आशा', '???'],
    ['line\nbreak', 'line break'],
    [null, ''],
    [undefined, '']
  ])('pdfSafe(%p) -> %p', (input, out) => {
    expect(pdfSafe(input)).toBe(out);
  });
});

// ── Download endpoint ─────────────────────────────────────────────────────────

let counter = 0;
const makeOwner = (label: string, state = 'Delhi') => {
  counter++;
  return User.create({
    name: `${label} Account`, email: `${label.toLowerCase()}${counter}@test.com`, phone: '9999999999',
    passwordHash: 'x', role: 'owner', address: { city: 'Somewhere', state, pincode: '110001' }
  });
};
const bearer = (u: any) => `Bearer ${generateAccessToken({ userId: u._id.toString(), email: u.email, role: u.role })}`;
const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const getForm = (u: any, id: string, form: string) =>
  request(app).get(`/api/v1/twin/transfers/${id}/forms/${form}`).set('Authorization', bearer(u)).buffer(true).parse(binary);

const setup = async () => {
  const seller = await makeOwner('Seller', 'Maharashtra');
  const buyer = await makeOwner('Buyer');
  const stranger = await makeOwner('Stranger');
  const vehicle = await Vehicle.create({
    ownerId: seller._id, regNumber: `MH12AB${1000 + counter}`, type: 'car', fuelType: 'petrol',
    make: 'Honda', model: 'City', year: 2019, qrCodeId: `qr-f-${counter}`
  });
  const created = await request(app).post('/api/v1/twin/transfers').set('Authorization', bearer(seller)).send({ vehicleId: vehicle._id });
  const transferId: string = created.body.data.transferId;
  const apply = () => request(app).post('/api/v1/twin/transfers/request').set('Authorization', bearer(buyer)).send({ token: created.body.data.token });
  const approve = () => request(app).post(`/api/v1/twin/transfers/${transferId}/approve`).set('Authorization', bearer(seller));
  return { seller, buyer, stranger, vehicle, transferId, apply, approve };
};

describe('GET /twin/transfers/:id/forms/:form', () => {
  it('needs a login: a forwarded URL gets nobody anything', async () => {
    const t = await setup();
    await t.apply();
    await t.approve();
    for (const url of [
      `/api/v1/twin/transfers/${t.transferId}/forms/form29`,
      `/api/v1/twin/transfers/${t.transferId}/forms/form29?t=anything&token=anything`
    ]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).not.toMatch(/pdf/);
    }
  });

  it("answers 404 to someone who isn't a party", async () => {
    const t = await setup();
    await t.apply();
    await t.approve();
    for (const form of ['form29', 'form30', 'insurer-letter']) {
      expect((await getForm(t.stranger, t.transferId, form)).status).toBe(404);
    }
  });

  it('is unavailable until the transfer is approved', async () => {
    const t = await setup();
    await t.apply();
    expect((await getForm(t.buyer, t.transferId, 'form30')).status).toBe(409);
    expect((await getForm(t.seller, t.transferId, 'form29')).status).toBe(409);
  });

  it('404s an unknown form name, and ignores path tricks', async () => {
    const t = await setup();
    await t.apply();
    await t.approve();
    for (const form of ['form31', '..%2F..%2Fetc', 'FORM29']) {
      expect((await getForm(t.seller, t.transferId, form)).status).toBe(404);
    }
  });

  it('gives both parties each worksheet as a download that is never cached', async () => {
    const t = await setup();
    await t.apply();
    await t.approve();

    for (const who of [t.seller, t.buyer]) {
      for (const [form, name] of [['form29', 'Form29-worksheet'], ['form30', 'Form30-worksheet'], ['insurer-letter', 'Insurer-letter']]) {
        const res = await getForm(who, t.transferId, form);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toMatch(new RegExp(`^attachment; filename="${name}-MH12AB\\d+\\.pdf"$`));
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['referrer-policy']).toBe('no-referrer');
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }
    }
  });

  it('renders with real, filled-in details', async () => {
    const t = await setup();
    await t.apply();
    await request(app).put(`/api/v1/twin/transfers/${t.transferId}/paperwork`).set('Authorization', bearer(t.buyer))
      .send({ party: { fullName: 'Ravi Kumar', guardianName: 'Suresh Kumar', relation: 'S/o', mobile: '9812345678', address: { line1: '44 Gandhi Lane', city: 'New Delhi', state: 'Delhi', pincode: '110002' } } });
    await t.approve();

    const res = await getForm(t.seller, t.transferId, 'form29');
    expect(res.status).toBe(200);
    expect((res.body as Buffer).length).toBeGreaterThan(2000);
  });

  it('records each download by form name, with no personal data', async () => {
    const t = await setup();
    await t.apply();
    await t.approve();
    await getForm(t.buyer, t.transferId, 'form30');

    const rows = await PaperworkAudit.find({ transferId: t.transferId, action: 'form_download' }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].form).toBe('form30');
    expect(rows[0].role).toBe('buyer');
    expect(rows[0].fields).toEqual([]);
  });

  it('puts no download link or token anywhere in the paperwork responses', async () => {
    const t = await setup();
    await t.apply();
    await t.approve();
    const view = await request(app).get(`/api/v1/twin/transfers/${t.transferId}/paperwork`).set('Authorization', bearer(t.buyer));
    const text = JSON.stringify(view.body);
    expect(text).not.toMatch(/forms\/form/);
    expect(text).not.toMatch(/[?&](t|token)=/);
    expect(view.body.data.officialFormsUrl).toBe(ENV.OFFICIAL_FORMS_URL); // the only link: to the official site
  });
});
