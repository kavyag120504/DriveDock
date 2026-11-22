import { StampmitraRegistryProvider, parseStampmitraRcResponse } from '../providers/stampmitraRegistry';

const plate = 'MH12AB1234';
// Shape taken from StampMitra's published /v1/verify/rc example; personal values are placeholders.
const sample = (extra: Record<string, unknown> = {}) => ({
  referenceId: 'SMV-20260927-3D71Q9', regNo: plate, registrationStatus: 'VALID', ownerName: 'REDACTED_OWNER',
  ownerFatherName: 'REDACTED_FATHER', vehicleClass: 'LMV', vehicleManufacturerName: 'MARUTI SUZUKI', model: 'SWIFT',
  vehicleColor: 'WHITE', chassis: 'REDACTED_CHASSIS', engine: 'REDACTED_ENGINE', registrationDate: '2019-05-14',
  rcStatus: 'ACTIVE', rcExpiryDate: '2034-05-13', insuranceUpto: '2025-05-13', isCommercial: false, ...extra
});
const reply = (status: number, body: unknown) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;

describe('StampMitra response boundary', () => {
  test('sample: active record with explicit RC expiry; owner, chassis and engine are dropped', () => {
    const record = parseStampmitraRcResponse(sample(), plate, false);
    expect(record).toMatchObject({ found: true, status: 'active', registrationDate: '2019-05-14', rcValidUpto: '2034-05-13',
      insuranceValidUpto: '2025-05-13', makeModel: 'MARUTI SUZUKI SWIFT', referenceId: 'SMV-20260927-3D71Q9' });
    expect(JSON.stringify(record)).not.toMatch(/REDACTED|ownerName|chassis|engine/);
  });

  test('only the documented VALID + ACTIVE pair is active; anything else stays unknown', () => {
    expect(parseStampmitraRcResponse(sample({ rcStatus: 'PENDING' }), plate, false).status).toBe('unknown');
    expect(parseStampmitraRcResponse(sample({ registrationStatus: 'SOMETHING_NEW' }), plate, false).status).toBe('unknown');
    expect(parseStampmitraRcResponse(sample({ rcStatus: null }), plate, false).status).toBe('unknown');
  });

  test.each([['SUSPENDED', 'suspended'], ['BLACKLISTED', 'suspended'], ['SCRAPPED', 'scrapped'], ['CANCELLED', 'inactive'], ['EXPIRED', 'inactive']])(
    'a %s status is never active', (value, expected) => {
      expect(parseStampmitraRcResponse(sample({ rcStatus: value }), plate, false).status).toBe(expected);
      expect(parseStampmitraRcResponse(sample({ registrationStatus: value }), plate, false).status).toBe(expected);
    });

  test('negative determinations (found/valid false, or no regNo) are not-found records, still with a reference id', () => {
    expect(parseStampmitraRcResponse({ referenceId: 'SMV-1', found: false }, plate, false)).toMatchObject({ found: false, referenceId: 'SMV-1' });
    expect(parseStampmitraRcResponse({ referenceId: 'SMV-1', valid: false }, plate, false).found).toBe(false);
    expect(parseStampmitraRcResponse({ referenceId: 'SMV-1' }, plate, false).found).toBe(false);
  });

  test('live responses must echo the plate; sandbox canned plates are tolerated', () => {
    expect(() => parseStampmitraRcResponse(sample({ regNo: 'DL01AB1234' }), plate, false)).toThrow('different registration');
    expect(parseStampmitraRcResponse(sample({ regNo: 'DL01AB1234' }), plate, true).found).toBe(true);
  });

  test.each([null, {}, [], { regNo: plate }, 'text'])('rejects %p', (payload) => {
    expect(() => parseStampmitraRcResponse(payload, plate, false)).toThrow();
  });

  test('invalid dates fail closed', () => {
    const record = parseStampmitraRcResponse(sample({ rcExpiryDate: '2034-02-30', registrationDate: 'NA' }), plate, false);
    expect(record.rcValidUpto).toBeNull();
    expect(record.registrationDate).toBeNull();
  });
});

describe('StampMitra provider', () => {
  test('sk_test_ is test mode and sk_live_ is not', () => {
    expect(new StampmitraRegistryProvider({ key: 'sk_test_abc' }).testMode).toBe(true);
    expect(new StampmitraRegistryProvider({ key: 'sk_live_abc' }).testMode).toBe(false);
  });

  test('sends one bearer POST with only the normalised plate', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetcher = (async (url: string, init: any) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => sample() }; }) as unknown as typeof fetch;
    const record = await new StampmitraRegistryProvider({ key: 'sk_live_secret', fetcher }).lookup('mh-12 ab1234');
    expect(record.found).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api-b2b.stampmitra.in/v1/verify/rc');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk_live_secret');
    expect(JSON.parse(calls[0].init.body)).toEqual({ vehicleNumber: plate });
  });

  test('a base URL override is used and trailing slashes are trimmed', async () => {
    let url = '';
    const fetcher = (async (u: string) => { url = u; return { ok: true, status: 200, json: async () => sample() }; }) as unknown as typeof fetch;
    await new StampmitraRegistryProvider({ key: 'sk_test_x', baseUrl: 'https://example.test/', fetcher }).lookup(plate);
    expect(url).toBe('https://example.test/v1/verify/rc');
  });

  test.each([
    [400, 'BAD_REQUEST', 'RC_NUMBER_INVALID'],
    [401, 'UNAUTHORIZED', 'RC_PROVIDER_AUTH_FAILED'],
    [403, 'FORBIDDEN', 'RC_PROVIDER_AUTH_FAILED'],
    [402, 'PAYMENT_REQUIRED', 'RC_CREDITS_UNAVAILABLE'],
    [429, 'TOO_MANY_REQUESTS', 'RC_PROVIDER_UNAVAILABLE'],
    [502, 'INTERNAL_ERROR', 'RC_PROVIDER_UNAVAILABLE'],
    [409, 'SOMETHING', 'RC_PROVIDER_FAILED']
  ])('maps HTTP %i %s to %s without passing vendor text on', async (status, code, expected) => {
    const fetcher = reply(status, { error: { code, message: 'private vendor text', requestId: 'r' } });
    await expect(new StampmitraRegistryProvider({ key: 'sk_test_x', fetcher }).lookup(plate)).rejects.toMatchObject({ code: expected });
  });

  test('missing key, bad plate and daily limit fail before any request', async () => {
    let called = 0;
    const fetcher = (async () => { called++; return { ok: true, status: 200, json: async () => sample() }; }) as unknown as typeof fetch;
    await expect(new StampmitraRegistryProvider({ key: ' ', fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_NOT_CONFIGURED' });
    await expect(new StampmitraRegistryProvider({ key: 'sk_test_x', fetcher }).lookup('BAD')).rejects.toMatchObject({ code: 'RC_NUMBER_INVALID' });
    await expect(new StampmitraRegistryProvider({ key: 'sk_test_x', dailyLimit: 0, fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_DAILY_LIMIT' });
    expect(called).toBe(0);
  });

  test('network failure and unreadable bodies fail safely', async () => {
    const boom = (async () => { throw new Error('ECONNRESET detail'); }) as unknown as typeof fetch;
    await expect(new StampmitraRegistryProvider({ key: 'sk_test_x', fetcher: boom }).lookup(plate)).rejects.toMatchObject({ code: 'RC_PROVIDER_UNAVAILABLE' });
    const html = (async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } })) as unknown as typeof fetch;
    await expect(new StampmitraRegistryProvider({ key: 'sk_test_x', fetcher: html }).lookup(plate)).rejects.toMatchObject({ code: 'RC_RESPONSE_INVALID' });
  });
});
