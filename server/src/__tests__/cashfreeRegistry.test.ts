import crypto from 'crypto';
import { CashfreeRegistryProvider, cashfreeSignature, parseCashfreeRcResponse } from '../providers/cashfreeRegistry';

const plate = 'MH01AB1234';
const vid = 'dd_test';
// Shape taken from Cashfree's published VALID example (values are test placeholders).
const valid = (extra: Record<string, unknown> = {}) => ({
  verification_id: vid, reference_id: 88, status: 'VALID', reg_no: plate, vehicle_number: plate,
  vehicle_manufacturer_name: 'HYUNDAI MOTOR INDIA LTD', model: 'TEST MODEL', type: 'PETROL',
  owner: 'REDACTED_OWNER', owner_father_name: 'REDACTED_FATHER', chassis: 'REDACTED_CHASSIS', engine: 'REDACTED_ENGINE',
  present_address: 'REDACTED_ADDRESS', vehicle_insurance_policy_number: 'REDACTED_POLICY', rc_financer: 'REDACTED_BANK',
  rc_status: 'ACTIVE', reg_date: '24/12/2021', rc_expiry_date: '23/12/2036', vehicle_insurance_upto: '14/12/2024',
  pucc_upto: '23/12/2022', blacklist_status: 'NA', ...extra
});
const reply = (status: number, body: unknown) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;

describe('Cashfree response boundary', () => {
  test('VALID record gives status, registration date and explicit RC expiry, and drops personal data', () => {
    const record = parseCashfreeRcResponse(valid(), plate, vid, false);
    expect(record).toMatchObject({ found: true, status: 'active', registrationDate: '2021-12-24', rcValidUpto: '2036-12-23',
      insuranceValidUpto: '2024-12-14', pucValidUpto: '2022-12-23', fuelType: 'petrol', referenceId: '88' });
    expect(JSON.stringify(record)).not.toMatch(/REDACTED/);
  });

  test('INVALID is a not-found record', () => {
    expect(parseCashfreeRcResponse({ verification_id: vid, status: 'INVALID', reg_no: null }, plate, vid, false).found).toBe(false);
  });

  test('production requires the registry plate to match; sandbox tolerates canned plates', () => {
    expect(() => parseCashfreeRcResponse(valid({ reg_no: 'PY01MW8675' }), plate, vid, false)).toThrow('different registration');
    expect(() => parseCashfreeRcResponse(valid({ reg_no: null, vehicle_number: null }), plate, vid, false)).toThrow();
    expect(parseCashfreeRcResponse(valid({ reg_no: 'PY01MW8675' }), plate, vid, true).found).toBe(true);
  });

  test.each([null, {}, { status: 'MAYBE' }, { ...valid(), verification_id: 'someone-else' }])('rejects %p', (payload) => {
    expect(() => parseCashfreeRcResponse(payload, plate, vid, false)).toThrow();
  });

  test('blacklist and non-active statuses are never active', () => {
    expect(parseCashfreeRcResponse(valid({ blacklist_status: 'BLACKLISTED' }), plate, vid, false).status).toBe('suspended');
    expect(parseCashfreeRcResponse(valid({ rc_status: 'SCRAPPED' }), plate, vid, false).status).toBe('scrapped');
    expect(parseCashfreeRcResponse(valid({ rc_status: null }), plate, vid, false).status).toBe('unknown');
  });
});

describe('Cashfree provider', () => {
  test('sandbox by default: one POST to the sandbox host with client headers and only the plate', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetcher = (async (url: string, init: any) => {
      calls.push({ url, init });
      const sent = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => valid({ verification_id: sent.verification_id }) };
    }) as unknown as typeof fetch;
    const provider = new CashfreeRegistryProvider({ clientId: 'id', clientSecret: 'secret', fetcher });
    expect(provider.testMode).toBe(true);
    await provider.lookup('mh-01 ab1234');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://sandbox.cashfree.com/verification/vehicle-rc');
    expect(calls[0].init.headers).toMatchObject({ 'x-client-id': 'id', 'x-client-secret': 'secret' });
    expect(calls[0].init.headers['x-cf-signature']).toBeUndefined();
    const body = JSON.parse(calls[0].init.body);
    expect(Object.keys(body).sort()).toEqual(['vehicle_number', 'verification_id']);
    expect(body.vehicle_number).toBe(plate);
    expect(body.verification_id).toMatch(/^[A-Za-z0-9_]{1,50}$/);
  });

  test('production uses the production host and is not test mode', async () => {
    let url = '';
    const fetcher = (async (u: string, init: any) => {
      url = u;
      return { ok: true, status: 200, json: async () => valid({ verification_id: JSON.parse(init.body).verification_id }) };
    }) as unknown as typeof fetch;
    const provider = new CashfreeRegistryProvider({ clientId: 'id', clientSecret: 's', environment: 'production', fetcher });
    expect(provider.testMode).toBe(false);
    await provider.lookup(plate);
    expect(url).toBe('https://api.cashfree.com/verification/vehicle-rc');
  });

  test.each([
    [400, 'vehicle_rc_value_invalid', 'RC_NUMBER_INVALID'],
    [401, 'authentication_failed', 'RC_PROVIDER_AUTH_FAILED'],
    [403, 'ip_validation_failed', 'RC_PROVIDER_AUTH_FAILED'],
    [400, 'x-client-secret_value_invalid', 'RC_PROVIDER_AUTH_FAILED'],
    [422, 'insufficient_balance', 'RC_CREDITS_UNAVAILABLE'],
    [429, 'too_many_requests_per_ip', 'RC_PROVIDER_UNAVAILABLE'],
    [502, 'verification_failed', 'RC_PROVIDER_UNAVAILABLE'],
    [409, 'verification_id_already_exists', 'RC_PROVIDER_FAILED']
  ])('maps HTTP %i %s to %s', async (status, code, expected) => {
    const fetcher = reply(status, { type: 'x', code, message: 'private vendor text' });
    await expect(new CashfreeRegistryProvider({ clientId: 'id', clientSecret: 's', fetcher }).lookup(plate))
      .rejects.toMatchObject({ code: expected });
  });

  test('missing credentials, bad plate and the daily limit fail before any request', async () => {
    let called = 0;
    const fetcher = (async () => { called++; return { ok: true, status: 200, json: async () => valid() }; }) as unknown as typeof fetch;
    await expect(new CashfreeRegistryProvider({ clientId: 'id', clientSecret: ' ', fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_NOT_CONFIGURED' });
    await expect(new CashfreeRegistryProvider({ clientId: 'id', clientSecret: 's', fetcher }).lookup('BAD')).rejects.toMatchObject({ code: 'RC_NUMBER_INVALID' });
    await expect(new CashfreeRegistryProvider({ clientId: 'id', clientSecret: 's', dailyLimit: 0, fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_DAILY_LIMIT' });
    expect(called).toBe(0);
  });

  test('x-cf-signature decrypts to "<clientId>.<unix seconds>" with the matching private key', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const sig = cashfreeSignature('client123', pem, 1_700_000_000_000);
    const plain = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
      Buffer.from(sig, 'base64')).toString();
    expect(plain).toBe('client123.1700000000');
  });
});
