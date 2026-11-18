/**
 * Registration-number rule, RC text parsing and the RC scan / vehicle create endpoints.
 * OCR itself is replaced with canned text so these tests never run Tesseract.
 */
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import vehicleRoutes from '../routes/vehicleRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { providers } from '../providers';
import { isValidRegNumber, normalizeRegNumber } from '../services/regNumber';
import { parseRcText } from '../services/rcParserService';
import { Vehicle } from '../models/Vehicle';
import { setupTestDB, teardownTestDB, clearDB, makeOwner, makeUser, authHeader } from './helpers';

describe('registration number rule', () => {
  test.each(['MH01AB1234', 'DL3CAB1234', 'HR26DK9012', 'MH12A1234', 'KA011234', 'UP16KB4321', '22BH1234AB', '21BH0001A'])(
    'accepts %s', (reg) => expect(isValidRegNumber(reg)).toBe(true)
  );
  test.each(['', 'MH01AB123', 'XX01AB1234', 'MH01ABCD1234', '1234', 'MHAB1234', 'MH01AB12345', '22BH12AB', 'DROP TABLE'])(
    'rejects %s', (reg) => expect(isValidRegNumber(reg)).toBe(false)
  );
  test('normalises spacing, hyphens, dots and case', () => {
    expect(normalizeRegNumber('mh-01 ab.1234')).toBe('MH01AB1234');
    expect(isValidRegNumber('mh 01 ab 1234')).toBe(true);
  });
});

describe('parseRcText', () => {
  test('paper/smart-card RC with labels on the same line', () => {
    const s = parseRcText([
      'FORM 23 CERTIFICATE OF REGISTRATION',
      'Regn. No. : MH 12 AB 1234',
      "Owner's Name : RAHUL SHARMA",
      'Address : 12 MG ROAD PUNE',
      'Chassis No. : MA3EWDE1S00123456',
      'Engine No. : K12MN1234567',
      "Maker's Name : MARUTI SUZUKI INDIA LTD",
      'Model Name : SWIFT DZIRE VXI',
      'Fuel Used : PETROL',
      'Vehicle Class : LMV',
      'Mfg. Date : 06/2018',
      'Regn. Date : 15-07-2018'
    ]);
    expect(s).toEqual({ regNumber: 'MH12AB1234', make: 'Maruti Suzuki', model: 'Swift Dzire Vxi', year: 2018, fuelType: 'petrol', vehicleType: 'car' });
  });

  test('values on the next line, OCR letter/digit swaps fixed in the plate', () => {
    const s = parseRcText(['REGN NO', 'DL 3C AB I23O', 'MAKER', 'HERO MOTOCORP LTD', 'MODEL', 'SPLENDOR PLUS', 'FUEL', 'PETROL', 'VEH CL', 'M-CYCLE/SCOOTER(2WN)', 'REGN DT', '03/02/2021']);
    expect(s.regNumber).toBe('DL3CAB1230');
    expect(s.make).toBe('Hero Motocorp');
    expect(s.model).toBe('Splendor Plus');
    expect(s.vehicleType).toBe('bike');
    expect(s.year).toBe(2021);
  });

  test('mParivahan screen with a combined Maker / Model line and a BH plate', () => {
    const s = parseRcText(['Registration No: 22BH1234AB', 'Maker / Model: TATA MOTORS LTD / NEXON EV MAX', 'Fuel Type: ELECTRIC(BOV)', 'Vehicle Class: Motor Car(LMV)', 'Registration Date: 10-Jan-2023']);
    expect(s).toEqual({ regNumber: '22BH1234AB', make: 'Tata', model: 'Nexon Ev Max', year: 2023, fuelType: 'ev', vehicleType: 'car' });
  });

  test('never returns personal data or chassis/engine numbers as a plate or field', () => {
    const s = parseRcText(["Owner's Name : PRIYA VERMA", 'Chassis No : MA1TA2SC3K4567890', 'Engine No: HR10EN1234567']);
    expect(s.regNumber).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/PRIYA|VERMA|MA1TA2|HR10EN/i);
  });

  test('unreadable text gives empty suggestions', () => {
    expect(parseRcText(['~~~', '###'])).toEqual({ regNumber: null, make: null, model: null, year: null, fuelType: null, vehicleType: null });
  });
});

describe('vehicle endpoints', () => {
  const app = express();
  app.use(express.json());
  app.use('/vehicles', vehicleRoutes);
  app.use(errorHandler);

  const realScan = providers.ocr.scanRc;
  const tmpImage = path.join(os.tmpdir(), `rc-${process.pid}.jpg`);

  beforeAll(async () => {
    await setupTestDB();
    fs.writeFileSync(tmpImage, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
  });
  afterAll(async () => {
    providers.ocr.scanRc = realScan;
    fs.rmSync(tmpImage, { force: true });
    await teardownTestDB();
  });
  afterEach(clearDB);

  test('create rejects a malformed registration number with 400 INVALID_REG_NUMBER', async () => {
    const owner = await makeOwner();
    const res = await request(app).post('/vehicles').set('Authorization', authHeader(owner))
      .send({ regNumber: 'ABC123', make: 'Tata', model: 'Nexon', year: 2022 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REG_NUMBER');
    expect(await Vehicle.countDocuments()).toBe(0);
  });

  test('create accepts and normalises a spaced plate', async () => {
    const owner = await makeOwner();
    const res = await request(app).post('/vehicles').set('Authorization', authHeader(owner))
      .send({ regNumber: 'mh 12 ab-1234', make: 'Tata', model: 'Nexon', year: 2022 });
    expect(res.status).toBe(201);
    expect(res.body.data.regNumber).toBe('MH12AB1234');
  });

  test('scan-rc returns suggestions, a found count, and deletes the uploaded photo', async () => {
    let seenPath = '';
    providers.ocr.scanRc = async (p: string) => {
      seenPath = p;
      return { regNumber: 'MH12AB1234', make: 'Tata', model: 'Nexon', year: 2022, fuelType: 'petrol', vehicleType: 'car' };
    };
    const owner = await makeOwner();
    const res = await request(app).post('/vehicles/scan-rc').set('Authorization', authHeader(owner))
      .attach('file', tmpImage, { contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ regNumber: 'MH12AB1234', found: 6, warning: null });
    expect(fs.existsSync(seenPath)).toBe(false);
    expect(await Vehicle.countDocuments()).toBe(0); // scanning never creates a vehicle
  });

  test('scan-rc degrades to empty suggestions with a warning when OCR fails', async () => {
    providers.ocr.scanRc = async () => { throw new Error('OCR timeout'); };
    const owner = await makeOwner();
    const res = await request(app).post('/vehicles/scan-rc').set('Authorization', authHeader(owner))
      .attach('file', tmpImage, { contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ regNumber: null, found: 0 });
    expect(res.body.data.warning).toMatch(/enter the details manually/);
  });

  test('scan-rc needs a photo, and is owner-only', async () => {
    const owner = await makeOwner();
    const noFile = await request(app).post('/vehicles/scan-rc').set('Authorization', authHeader(owner));
    expect(noFile.status).toBe(400);
    const officer = await makeUser('officer');
    const forbidden = await request(app).post('/vehicles/scan-rc').set('Authorization', authHeader(officer))
      .attach('file', tmpImage, { contentType: 'image/jpeg' });
    expect(forbidden.status).toBe(403);
    const anon = await request(app).post('/vehicles/scan-rc');
    expect(anon.status).toBe(401);
  });
});
