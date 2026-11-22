import { IdfyRegistryProvider, idfyDate, parseIdfyTask } from '../providers/idfyRegistry';

const plate = 'MH01AB1234';
const rid = 'req-1';
// Field names from IDfy's published ind_rc_plus "Get task" example; values are test placeholders.
const completed = (out: Record<string, unknown> = {}) => [{
  action: 'verify_with_source', request_id: rid, status: 'completed', type: 'ind_rc_plus',
  result: { extraction_output: {
    registration_number: plate, status: 'ACTIVE', registration_date: '14-May-2019', fitness_upto: '13-May-2034',
    insurance_validity: '2027-01-31', puc_valid_upto: '31/12/2026', fuel_type: 'PETROL', manufacturer: 'MARUTI', manufacturer_model: 'SWIFT',
    blacklist_status: 'NA', owner_name: 'REDACTED_OWNER', father_name: 'REDACTED_FATHER', permanent_address: 'REDACTED_ADDR',
    owner_mobile_no: 'REDACTED_MOBILE', chassis_number: 'REDACTED_CHASSIS', engine_number: 'REDACTED_ENGINE',
    financer: 'REDACTED_BANK', insurance_policy_no: 'REDACTED_POLICY', ...out
  } }
}];
const noSleep = async () => {};

describe('IDfy task parsing', () => {
  test('completed task: status, dates and fitness kept apart from RC expiry; personal data dropped', () => {
    const record = parseIdfyTask(completed(), plate, rid)!;
    expect(record).toMatchObject({ found: true, status: 'active', registrationDate: '2019-05-14', rcValidUpto: null,
      fitnessValidUpto: '2034-05-13', insuranceValidUpto: '2027-01-31', pucValidUpto: '2026-12-31', fuelType: 'petrol',
      makeModel: 'MARUTI SWIFT', referenceId: rid });
    expect(JSON.stringify(record)).not.toMatch(/REDACTED/);
  });

  test('in-progress returns null so the caller keeps polling', () => {
    expect(parseIdfyTask([{ request_id: rid, status: 'in_progress' }], plate, rid)).toBeNull();
  });

  test('not-found shapes become a not-found record', () => {
    expect(parseIdfyTask(completed({ status: 'id_not_found' }), plate, rid)!.found).toBe(false);
    expect(parseIdfyTask(completed({ registration_number: '' }), plate, rid)!.found).toBe(false);
    expect(parseIdfyTask([{ request_id: rid, status: 'completed', result: {} }], plate, rid)!.found).toBe(false);
  });

  test('failed BAD_REQUEST is an invalid plate; a different returned plate is refused', () => {
    expect(() => parseIdfyTask([{ request_id: rid, status: 'failed', error: 'BAD_REQUEST',
      message: 'Invalid parameter: RC number should be between 7 to 11 characters long' }], plate, rid)).toThrow('valid vehicle registration');
    expect(() => parseIdfyTask(completed({ registration_number: 'DL01AB1234' }), plate, rid)).toThrow('different registration');
  });

  test.each([null, {}, [{}], [{ status: 'weird' }], [{ request_id: 'other', status: 'completed' }]])('rejects %p', (payload) => {
    expect(() => parseIdfyTask(payload, plate, rid)).toThrow();
  });

  test('blacklist overrides ACTIVE; unknown status stays unknown', () => {
    expect(parseIdfyTask(completed({ blacklist_status: 'BLACKLISTED' }), plate, rid)!.status).toBe('suspended');
    expect(parseIdfyTask(completed({ status: 'id_found' }), plate, rid)!.status).toBe('unknown');
  });

  test('dates: named months parse, invalid dates fail closed', () => {
    expect(idfyDate('5-Jan-2020')).toBe('2020-01-05');
    expect(idfyDate('31-Feb-2020')).toBeNull();
    expect(idfyDate('NA')).toBeNull();
  });
});

describe('IDfy provider (RapidAPI)', () => {
  const host = 'vehicle-rc-verification-advanced.p.rapidapi.com';

  test('submits once, then polls until completed, with RapidAPI headers and only the plate', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    let polls = 0;
    const fetcher = (async (url: string, init: any) => {
      calls.push({ url, init });
      if (init.method === 'POST') return { ok: true, status: 202, json: async () => ({ request_id: rid }) };
      polls++;
      return { ok: true, status: 200, json: async () => (polls < 2 ? [{ request_id: rid, status: 'in_progress' }] : completed()) };
    }) as unknown as typeof fetch;
    const record = await new IdfyRegistryProvider({ rapidApiKey: 'key', fetcher, sleep: noSleep }).lookup('mh-01 ab1234');
    expect(record.found).toBe(true);
    expect(calls).toHaveLength(3); // 1 submit + 2 polls
    expect(calls[0].url).toBe(`https://${host}/v3/tasks/async/verify_with_source/ind_rc_plus`);
    expect(calls[0].init.headers).toMatchObject({ 'x-rapidapi-key': 'key', 'x-rapidapi-host': host });
    const body = JSON.parse(calls[0].init.body);
    expect(body.data).toEqual({ rc_number: plate });
    expect(calls[1].url).toBe(`https://${host}/v3/tasks?request_id=${rid}`);
  });

  test('gives up after three polls without spending more quota', async () => {
    let count = 0;
    const fetcher = (async (_u: string, init: any) => {
      count++;
      return init.method === 'POST' ? { ok: true, status: 202, json: async () => ({ request_id: rid }) }
        : { ok: true, status: 200, json: async () => [{ request_id: rid, status: 'in_progress' }] };
    }) as unknown as typeof fetch;
    await expect(new IdfyRegistryProvider({ rapidApiKey: 'k', fetcher, sleep: noSleep }).lookup(plate)).rejects.toMatchObject({ code: 'RC_TIMEOUT' });
    expect(count).toBe(4);
  });

  test.each([
    [403, 'You are not subscribed to this API.', 'RC_PROVIDER_AUTH_FAILED'],
    [401, 'Invalid API key.', 'RC_PROVIDER_AUTH_FAILED'],
    [429, 'You have exceeded the MONTHLY quota for Requests on your current plan, BASIC.', 'RC_CREDITS_UNAVAILABLE'],
    [429, 'Too many requests', 'RC_PROVIDER_UNAVAILABLE'],
    [400, 'Bad Request', 'RC_NUMBER_INVALID'],
    [502, 'gateway', 'RC_PROVIDER_UNAVAILABLE']
  ])('maps HTTP %i (%s) to %s', async (status, message, expected) => {
    const fetcher = (async () => ({ ok: false, status, json: async () => ({ message }) })) as unknown as typeof fetch;
    await expect(new IdfyRegistryProvider({ rapidApiKey: 'k', fetcher, sleep: noSleep }).lookup(plate)).rejects.toMatchObject({ code: expected });
  });

  test('missing key, bad plate and daily limit fail before any request', async () => {
    let called = 0;
    const fetcher = (async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; }) as unknown as typeof fetch;
    await expect(new IdfyRegistryProvider({ rapidApiKey: '', fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_NOT_CONFIGURED' });
    await expect(new IdfyRegistryProvider({ rapidApiKey: 'k', fetcher }).lookup('BAD')).rejects.toMatchObject({ code: 'RC_NUMBER_INVALID' });
    await expect(new IdfyRegistryProvider({ rapidApiKey: 'k', dailyLimit: 0, fetcher }).lookup(plate)).rejects.toMatchObject({ code: 'RC_DAILY_LIMIT' });
    expect(called).toBe(0);
  });

  test('a submit without a request id fails safely', async () => {
    const fetcher = (async () => ({ ok: true, status: 202, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(new IdfyRegistryProvider({ rapidApiKey: 'k', fetcher, sleep: noSleep }).lookup(plate)).rejects.toMatchObject({ code: 'RC_RESPONSE_INVALID' });
  });
});
