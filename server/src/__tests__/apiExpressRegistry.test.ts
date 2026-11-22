import { ApiExpressRegistryProvider, apiExpressBaseUrl, parseApiExpressRcResponse } from '../providers/apiExpressRegistry';

const plate = 'MH12AB1234';
const ref = 'ref-1';
const success = (extra: Record<string, unknown> = {}) => ({
  status: 'success', owner_name: 'R***sh K***r', vehicle: 'Honda City VX', fuel: 'Petrol',
  insurance_valid: true, state: 'Maharashtra', rto: 'MH12 - Pune', ...extra
});
const reply = (status: number, body: unknown) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;

describe('API Express response boundary', () => {
  test('documented sample is a found record with unknown status and no dates, and drops owner data', () => {
    const record = parseApiExpressRcResponse(success(), plate, ref);
    expect(record).toMatchObject({ registrationNumber: plate, found: true, status: 'unknown', makeModel: 'Honda City VX',
      fuelType: 'petrol', registrationDate: null, rcValidUpto: null, referenceId: ref });
    expect(JSON.stringify(record)).not.toMatch(/owner|R\*\*\*sh|Pune|Maharashtra/);
  });

  test('accepts a data wrapper and parses explicit status and dates if the provider supplies them', () => {
    const record = parseApiExpressRcResponse({ status: 'success', data: success({ rc_status: 'ACTIVE',
      registration_date: '14/02/2023', rc_valid_upto: '2038-02-13' }) }, plate, ref);
    expect(record).toMatchObject({ status: 'active', registrationDate: '2023-02-14', rcValidUpto: '2038-02-13' });
  });

  test.each([null, {}, { status: 'error' }, { status: 'success', rc_number: 'DL01AB1234' }, []])(
    'rejects unrecognised or mismatched responses', (payload) => {
      expect(() => parseApiExpressRcResponse(payload, plate, ref)).toThrow();
    });

  test('blacklist and unknown status never read as active', () => {
    expect(parseApiExpressRcResponse(success({ rc_status: 'ACTIVE', blacklist_status: 'BLACKLISTED' }), plate, ref).status).toBe('suspended');
    expect(parseApiExpressRcResponse(success({ rc_status: 'weird' }), plate, ref).status).toBe('unknown');
  });

  test('sk_test_ keys use the sandbox host, live keys production, override wins', () => {
    expect(apiExpressBaseUrl('sk_test_abc')).toBe('https://sandbox.api.apiexpress.in');
    expect(apiExpressBaseUrl('sk_live_abc')).toBe('https://api.apiexpress.in');
    expect(apiExpressBaseUrl('sk_live_abc', 'https://example.test/')).toBe('https://example.test');
  });
});

describe('API Express provider', () => {
  test('sends one bearer-authenticated POST with only the RC number', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetcher = (async (url: string, init: any) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => success() }; }) as unknown as typeof fetch;
    const record = await new ApiExpressRegistryProvider({ key: 'sk_live_secret', fetcher }).lookup('mh-12 ab1234');
    expect(record.found).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.apiexpress.in/v1/rc/verify');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk_live_secret');
    expect(JSON.parse(calls[0].init.body)).toEqual({ rc_number: plate });
  });

  test.each([
    [401, 'INVALID_API_KEY', 'RC_PROVIDER_AUTH_FAILED'],
    [403, 'QUOTA_EXCEEDED', 'RC_CREDITS_UNAVAILABLE'],
    [403, 'API_NOT_AVAILABLE', 'RC_PROVIDER_AUTH_FAILED'],
    [400, 'INVALID_RC_NUMBER', 'RC_NUMBER_INVALID'],
    [429, 'RATE_LIMIT_EXCEEDED', 'RC_PROVIDER_UNAVAILABLE'],
    [502, 'UPSTREAM_ERROR', 'RC_PROVIDER_UNAVAILABLE']
  ])('maps HTTP %i %s to %s', async (status, code, expected) => {
    const fetcher = reply(status, { status: 'error', code, message: 'private upstream text', http_status: status });
    await expect(new ApiExpressRegistryProvider({ key: 'sk_live_x', fetcher }).lookup(plate))
      .rejects.toMatchObject({ code: expected });
  });

  test.each([[404, 'NO_DATA'], [422, 'VERIFICATION_FAILED']])('HTTP %i %s is a not-found record, not an error', async (status, code) => {
    const record = await new ApiExpressRegistryProvider({ key: 'sk_live_x', fetcher: reply(status, { status: 'error', code }) }).lookup(plate);
    expect(record.found).toBe(false);
  });

  test('missing key, bad plate and daily limit fail before any request', async () => {
    let called = 0;
    const fetcher = (async () => { called++; return { ok: true, status: 200, json: async () => success() }; }) as unknown as typeof fetch;
    await expect(new ApiExpressRegistryProvider({ key: ' ', fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_NOT_CONFIGURED' });
    await expect(new ApiExpressRegistryProvider({ key: 'k', fetcher }).lookup('NOTAPLATE')).rejects.toMatchObject({ code: 'RC_NUMBER_INVALID' });
    await expect(new ApiExpressRegistryProvider({ key: 'k', dailyLimit: 0, fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_DAILY_LIMIT' });
    expect(called).toBe(0);
  });

  test('network failure and non-JSON bodies fail safely', async () => {
    const boom = (async () => { throw new Error('ECONNRESET secret-detail'); }) as unknown as typeof fetch;
    await expect(new ApiExpressRegistryProvider({ key: 'k', fetcher: boom }).lookup(plate)).rejects.toMatchObject({ code: 'RC_PROVIDER_UNAVAILABLE' });
    const html = (async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } })) as unknown as typeof fetch;
    await expect(new ApiExpressRegistryProvider({ key: 'k', fetcher: html }).lookup(plate)).rejects.toMatchObject({ code: 'RC_RESPONSE_INVALID' });
  });
});
