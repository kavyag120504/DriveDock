import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../index';
import { ENV } from '../config/env';
import { DocumentModel } from '../models/Document';
import { signFileUrl, verifyFileSignature } from '../services/fileAccess';
import { setupTestDB, teardownTestDB, clearDB, makeOwner, makeVehicle, authHeader } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHjCkdQAAAAASUVORK5CYII=', 'base64');
const uploaded: string[] = [];

beforeAll(setupTestDB);
afterEach(clearDB);
afterAll(async () => {
  for (const f of uploaded) fs.rmSync(f, { force: true });
  await teardownTestDB();
});

describe('signed file links (unit)', () => {
  const stored = 'https://api.example/uploads/file-123-456.png';

  test('one of our uploads becomes a signed, expiring link on the API path', () => {
    const link = new URL(signFileUrl(stored, 1_700_000_000_000));
    expect(link.origin).toBe('https://api.example');
    expect(link.pathname).toBe('/api/v1/files/file-123-456.png');
    expect(Number(link.searchParams.get('exp'))).toBe(1_700_000_000 + ENV.FILE_URL_TTL_SECONDS);
    expect(link.searchParams.get('sig')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('URLs that are not our uploads, and empty values, are returned unchanged', () => {
    expect(signFileUrl('https://bucket.s3.eu-west-1.amazonaws.com/documents/x.png')).toBe('https://bucket.s3.eu-west-1.amazonaws.com/documents/x.png');
    expect(signFileUrl('https://api.example/uploads/../secret.png')).toBe('https://api.example/uploads/../secret.png');
    expect(signFileUrl('not a url')).toBe('not a url');
    expect(signFileUrl('')).toBe('');
    expect(signFileUrl(undefined)).toBe('');
  });

  test('a signature is valid only for the same file, the same expiry and before it expires', () => {
    const now = 1_700_000_000_000;
    const link = new URL(signFileUrl(stored, now));
    const exp = link.searchParams.get('exp')!, sig = link.searchParams.get('sig')!;
    expect(verifyFileSignature('file-123-456.png', exp, sig, now)).toBe(true);
    expect(verifyFileSignature('file-999-999.png', exp, sig, now)).toBe(false);          // another file
    expect(verifyFileSignature('file-123-456.png', String(Number(exp) + 3600), sig, now)).toBe(false); // longer life
    expect(verifyFileSignature('file-123-456.png', exp, sig.replace(/.$/, sig.endsWith('0') ? '1' : '0'), now)).toBe(false);
    expect(verifyFileSignature('file-123-456.png', exp, sig, Number(exp) * 1000 + 1)).toBe(false); // expired
    expect(verifyFileSignature('file-123-456.png', 'abc', sig, now)).toBe(false);
    expect(verifyFileSignature('../etc/passwd', exp, sig, now)).toBe(false);
    expect(verifyFileSignature('file-123-456.png', exp, undefined, now)).toBe(false);
  });
});

describe('private uploads (API)', () => {
  const upload = async (ownerAuth: string, vehicleId: string) => {
    const res = await request(app).post(`/api/v1/vehicles/${vehicleId}/documents`).set('Authorization', ownerAuth)
      .field('type', 'puc').field('issueDate', '2026-01-01').field('expiryDate', '2027-01-01')
      .attach('file', PNG, { filename: 'puc.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    return res;
  };
  const nameOf = (url: string) => path.basename(new URL(url).pathname);

  test('the stored link is private: the API returns a signed link and /uploads is closed', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    const res = await upload(authHeader(owner), vehicle._id.toString());
    const signed: string = res.body.data.fileUrl;
    const name = nameOf(signed);
    uploaded.push(path.join(process.cwd(), 'uploads', name));

    expect(signed).toContain('/api/v1/files/');
    expect(signed).toContain('sig=');
    expect(signed).not.toContain('/uploads/');
    const raw = await DocumentModel.findOne({ vehicleId: vehicle._id }).lean();
    expect(raw!.fileUrl).toContain(`/uploads/${name}`);               // the database still holds the stored link

    expect((await request(app).get(`/uploads/${name}`)).status).toBe(404); // no public path to the file
  });

  test('the signed link serves the file, privately and without sniffing', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    const signed: string = (await upload(authHeader(owner), vehicle._id.toString())).body.data.fileUrl;
    uploaded.push(path.join(process.cwd(), 'uploads', nameOf(signed)));
    const link = new URL(signed);

    const ok = await request(app).get(link.pathname + link.search);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/image\/png/);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.body.length).toBe(PNG.length);
  });

  test('a tampered, unsigned or expired link is refused', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    const signed: string = (await upload(authHeader(owner), vehicle._id.toString())).body.data.fileUrl;
    const name = nameOf(signed);
    uploaded.push(path.join(process.cwd(), 'uploads', name));
    const link = new URL(signed);
    const exp = link.searchParams.get('exp')!, sig = link.searchParams.get('sig')!;

    expect((await request(app).get(`/api/v1/files/${name}`)).status).toBe(403);                              // no signature
    expect((await request(app).get(`/api/v1/files/${name}?exp=${exp}&sig=${'0'.repeat(64)}`)).status).toBe(403); // wrong signature
    expect((await request(app).get(`/api/v1/files/${name}?exp=${Number(exp) + 99999}&sig=${sig}`)).status).toBe(403); // longer life
    expect((await request(app).get(`/api/v1/files/other-file.png?exp=${exp}&sig=${sig}`)).status).toBe(403);   // another file

    const saved = ENV.FILE_URL_TTL_SECONDS;
    ENV.FILE_URL_TTL_SECONDS = -30;                                   // mint a link that is already expired
    const expired = new URL(signFileUrl(raw(signed)));
    ENV.FILE_URL_TTL_SECONDS = saved;
    expect((await request(app).get(expired.pathname + expired.search)).status).toBe(403);
  });

  test('a well-signed link to a file that does not exist is a 404', async () => {
    const link = new URL(signFileUrl('https://api.example/uploads/file-0-0.png'));
    expect((await request(app).get(link.pathname + link.search)).status).toBe(404);
  });

  test('the document list returns signed links, never the stored ones', async () => {
    const owner = await makeOwner();
    const vehicle = await makeVehicle(owner._id.toString());
    const res = await upload(authHeader(owner), vehicle._id.toString());
    uploaded.push(path.join(process.cwd(), 'uploads', nameOf(res.body.data.fileUrl)));
    const list = await request(app).get(`/api/v1/vehicles/${vehicle._id}/documents`).set('Authorization', authHeader(owner));
    expect(list.status).toBe(200);
    for (const d of list.body.data) {
      expect(d.fileUrl).toContain('/api/v1/files/');
      expect(d.fileUrl).not.toContain('/uploads/');
    }
  });
});

// The signed URL of an upload, turned back into its stored form, for minting a second link in a test.
const raw = (signed: string): string => {
  const u = new URL(signed);
  return `${u.origin}/uploads/${path.basename(u.pathname)}`;
};
