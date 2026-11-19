import { AryaRegistryProvider, parseAryaRcResponse, registryDate } from '../providers/aryaRegistry';

const plate = 'MH01AB1234';
const id = 'test-request';
const sample = (extra: Record<string, unknown> = {}) => ({
  success: true, req_id: id, error_message: '',
  data: { rc_number: plate, registration_date: '2023-02-14', rc_status: 'ACTIVE',
    blacklist_status: 'NA', maker_model: 'TEST MODEL', fuel_type: 'PETROL',
    fit_up_to: '2038-02-13', pucc_upto: '2024-02-13', insurance_upto: '2028-02-02',
    owner_name: 'REDACTED_TEST_OWNER', address: 'REDACTED_TEST_ADDRESS',
    insurance_policy_number: 'REDACTED_TEST_POLICY', ...extra }
});

describe('Arya response boundary', () => {
  test('V1 Lite sample matches an active record without inventing RC expiry from fitness', () => {
    const record = parseAryaRcResponse(sample(), plate, id);
    expect(record).toMatchObject({ registrationNumber: plate, status: 'active', found: true,
      registrationDate: '2023-02-14', rcValidUpto: null, fitnessValidUpto: '2038-02-13' });
    expect(JSON.stringify(record)).not.toMatch(/REDACTED|owner_name|policy_number|address/);
  });

  test('accepts explicit RC validity, normalised number and Indian date formatting', () => {
    expect(parseAryaRcResponse(sample({ rc_number: 'MH-01 AB1234', rc_valid_upto: '14/02/2038' }), plate, id))
      .toMatchObject({ rcValidUpto: '2038-02-14' });
  });

  test.each([null, {}, { success: 'true' }, { success: true, data: [] },
    { ...sample(), req_id: 'other-request' }, sample({ rc_number: 'DL01AB1234' }), sample({ rc_number: null })])
  ('rejects unrecognised or mismatched responses', (payload) => {
    expect(() => parseAryaRcResponse(payload, plate, id)).toThrow();
  });

  test.each(['CANCELLED', 'SUSPENDED', 'SCRAPPED', 'EXPIRED', 'unexpected'])('never treats %s as active', (status) => {
    expect(parseAryaRcResponse(sample({ rc_status: status }), plate, id).status).not.toBe('active');
  });

  test('blacklist overrides ACTIVE and missing status stays unknown', () => {
    expect(parseAryaRcResponse(sample({ blacklist_status: 'BLACKLISTED' }), plate, id).status).toBe('suspended');
    expect(parseAryaRcResponse(sample({ rc_status: null }), plate, id).status).toBe('unknown');
  });

  test('not-found responses are distinct from vendor failures and credits errors', () => {
    expect(parseAryaRcResponse({ success: false, error_message: 'RC not found' }, plate, id).found).toBe(false);
    expect(() => parseAryaRcResponse({ success: false, error_message: 'insufficient credits' }, plate, id))
      .toThrow('credits are unavailable');
    expect(() => parseAryaRcResponse({ success: false, error_message: 'token invalid' }, plate, id))
      .toThrow('credentials need');
    expect(() => parseAryaRcResponse({ success: false, error_message: 'private upstream message' }, plate, id))
      .toThrow('could not complete');
  });

  test.each(['2023-02-29', '2024-13-01', '31/04/2024', 'NA', '', '2024-01-01junk'])('invalid date %s fails closed', (value) => {
    expect(registryDate(value)).toBeNull();
  });
  test('valid leap dates and ISO timestamps parse', () => {
    expect(registryDate('2024-02-29')).toBe('2024-02-29');
    expect(registryDate('2024-02-29T00:00:00Z')).toBe('2024-02-29');
  });
});

describe('Arya HTTP adapter (mock transport; no credits)', () => {
  test('uses documented token header/body once and meters the request', async () => {
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ ...sample(), req_id: body.req_id }));
    });
    const provider = new AryaRegistryProvider({ token: 'test-only-token', dailyLimit: 1, fetcher: fetcher as typeof fetch });
    await expect(provider.lookup('mh01 ab1234')).resolves.toMatchObject({ registrationNumber: plate });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://ping.arya.ai/api/v1/rc-verification');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { token: 'test-only-token' } });
    expect(JSON.parse(init.body as string)).toEqual({ rc_num: plate, req_id: expect.any(String) });
    await expect(provider.lookup(plate)).rejects.toMatchObject({ code: 'RC_DAILY_LIMIT', httpStatus: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('missing credentials and malformed plates never call transport', async () => {
    const fetcher = jest.fn();
    await expect(new AryaRegistryProvider({ token: '', fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_NOT_CONFIGURED' });
    await expect(new AryaRegistryProvider({ token: 'test', fetcher }).lookup('invalid')).rejects.toMatchObject({ code: 'RC_NUMBER_INVALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([401, 403, 429, 500])('HTTP %s is safe and never retried', async (status) => {
    const fetcher = jest.fn(async () => new Response('private upstream details', { status }));
    const provider = new AryaRegistryProvider({ token: 'test-only-token', fetcher });
    await expect(provider.lookup(plate)).rejects.toMatchObject({ httpStatus: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('network and JSON errors expose no raw error or token', async () => {
    for (const fetcher of [jest.fn(async () => { throw new Error('test-only-token private details'); }),
      jest.fn(async () => new Response('not JSON private details'))]) {
      await expect(new AryaRegistryProvider({ token: 'test-only-token', fetcher }).lookup(plate))
        .rejects.toMatchObject({ code: 'RC_PROVIDER_UNAVAILABLE', message: expect.not.stringMatching(/test-only-token|private/) });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  test('aborts a slow request with a safe timeout', async () => {
    const fetcher = jest.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
    await expect(new AryaRegistryProvider({ token: 'test', timeoutMs: 10, fetcher }).lookup(plate))
      .rejects.toMatchObject({ code: 'RC_TIMEOUT', httpStatus: 504 });
  });

  test('a registry lookup is not ownership verification', async () => {
    await expect(new AryaRegistryProvider({ token: 'test' }).verifyOwnership())
      .rejects.toMatchObject({ code: 'RC_OWNERSHIP_UNSUPPORTED' });
  });
});
