import crypto from 'crypto';
import { RegistryProvider, RegistryVehicle } from './registry';
import { normaliseRegistration, RcVerificationError, registryDate } from './aryaRegistry';
import { UsageMeter } from './types';

/**
 * IDfy "Vehicle RC Verification Advanced" (task type ind_rc_plus) through RapidAPI. Individuals can sign up;
 * the Basic plan is $0 for 40 requests a month with a hard limit (no overage charges).
 *
 *   POST https://{host}/v3/tasks/async/verify_with_source/ind_rc_plus
 *        { task_id, group_id, data: { rc_number } }        -> { request_id }
 *   GET  https://{host}/v3/tasks?request_id=...            -> [ { status: completed|in_progress|failed, result: { extraction_output } } ]
 *   Headers: x-rapidapi-key, x-rapidapi-host
 *
 * Every POST and every poll counts against the RapidAPI quota, so polling is short and bounded.
 * The documented result has registration_date, status and fitness_upto but no explicit RC expiry, so a
 * match can reach "record matched", never "verified" (fitness is never substituted for RC expiry).
 * Owner name, father's name, addresses, mobile, chassis, engine, financer and policy number are dropped here.
 */

export const IDFY_DEFAULT_HOST = 'vehicle-rc-verification-advanced.p.rapidapi.com';
const REGISTRATION = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
const POLL_DELAYS_MS = [1500, 2500, 4000]; // at most 3 polls: each one uses a request from the monthly quota
const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const text = (data: Record<string, unknown>, key: string): string | null => {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

/** registryDate plus the "14-May-2019" style some VAHAN sources return. Invalid dates still fail closed. */
export const idfyDate = (value: string | null): string | null => {
  if (!value) return null;
  const named = /^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/.exec(value);
  if (named && MONTHS[named[2].toUpperCase()]) {
    return registryDate(`${named[1].padStart(2, '0')}-${MONTHS[named[2].toUpperCase()]}-${named[3]}`);
  }
  return registryDate(value);
};

const notFound = (registration: string, referenceId: string): RegistryVehicle => ({
  registrationNumber: registration, status: 'unknown', makeModel: '', fuelType: 'unknown',
  registrationDate: null, rcValidUpto: null, insuranceValidUpto: null, pucValidUpto: null,
  fitnessValidUpto: null, challansPending: false, referenceId, found: false
});

/** RapidAPI/IDfy HTTP errors -> safe client-facing errors. Vendor and gateway messages are never passed on. */
export function mapIdfyHttpError(httpStatus: number, message: string): never {
  if (httpStatus === 429 && /quota|exceeded|plan/i.test(message)) {
    throw new RcVerificationError('RC_CREDITS_UNAVAILABLE', 503, 'RC verification credits are unavailable. Contact the administrator.');
  }
  if (httpStatus === 401 || httpStatus === 403) {
    throw new RcVerificationError('RC_PROVIDER_AUTH_FAILED', 503, 'The RC service credentials need administrator attention.');
  }
  if (httpStatus === 400) throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
  if (httpStatus === 429 || httpStatus >= 500) {
    throw new RcVerificationError('RC_PROVIDER_UNAVAILABLE', 503, 'The RC service is unavailable. Try again later.');
  }
  throw new RcVerificationError('RC_PROVIDER_FAILED', 502, 'The RC service could not complete this check. No verification was granted.');
}

/** Parses one completed or failed task. Returns null while the task is still running. */
export function parseIdfyTask(payload: unknown, registration: string, requestId: string): RegistryVehicle | null {
  const task = object(Array.isArray(payload) ? payload[0] : payload);
  if (!task || typeof task.status !== 'string') {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  if (typeof task.request_id === 'string' && task.request_id && task.request_id !== requestId) {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  const status = task.status.toLowerCase();
  if (status === 'in_progress' || status === 'pending' || status === 'queued') return null;
  if (status === 'failed') {
    const error = typeof task.error === 'string' ? task.error.toUpperCase() : '';
    const message = typeof task.message === 'string' ? task.message : '';
    if (error === 'BAD_REQUEST' || /invalid parameter|rc number/i.test(message)) {
      throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
    }
    if (/not.?found|no record|does not exist/i.test(`${error} ${message}`)) return notFound(registration, requestId);
    throw new RcVerificationError('RC_PROVIDER_FAILED', 502, 'The RC service could not complete this check. No verification was granted.');
  }
  if (status !== 'completed') {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  const result = object(task.result);
  const out = result && (object(result.extraction_output) ?? object(result.source_output));
  if (!out) return notFound(registration, requestId);

  const rawStatus = (text(out, 'status') || '').toUpperCase();
  const returned = text(out, 'registration_number');
  if (/NOT.?FOUND|NO.?RECORD|INVALID/.test(rawStatus) || !returned) return notFound(registration, requestId);
  if (normaliseRegistration(returned) !== registration) {
    throw new RcVerificationError('RC_NUMBER_MISMATCH', 502, 'The RC service returned a different registration. No verification was granted.');
  }
  const blacklist = text(out, 'blacklist_status');
  const blacklisted = !!blacklist && !['NA', 'N/A', 'NONE', 'NIL', 'NO', 'FALSE', 'NOT BLACKLISTED', '0', '-'].includes(blacklist.toUpperCase());
  let regStatus: RegistryVehicle['status'] = 'unknown';
  if (blacklisted || rawStatus === 'SUSPENDED' || rawStatus === 'BLACKLISTED') regStatus = 'suspended';
  else if (rawStatus === 'SCRAPPED') regStatus = 'scrapped';
  else if (['INACTIVE', 'CANCELLED', 'DEREGISTERED', 'EXPIRED'].includes(rawStatus)) regStatus = 'inactive';
  else if (rawStatus === 'ACTIVE' || rawStatus === 'VALID') regStatus = 'active';
  const fuel = (text(out, 'fuel_type') || '').toLowerCase();
  return {
    registrationNumber: registration, status: regStatus,
    makeModel: [text(out, 'manufacturer'), text(out, 'manufacturer_model')].filter(Boolean).join(' '),
    fuelType: ['petrol', 'diesel', 'cng'].includes(fuel) ? fuel as 'petrol' | 'diesel' | 'cng'
      : ['electric', 'ev', 'electric(bov)'].includes(fuel) ? 'ev' : 'unknown',
    registrationDate: idfyDate(text(out, 'registration_date')),
    rcValidUpto: null, // not supplied by ind_rc_plus; fitness_upto is NOT RC validity
    fitnessValidUpto: idfyDate(text(out, 'fitness_upto')),
    insuranceValidUpto: idfyDate(text(out, 'insurance_validity')),
    pucValidUpto: idfyDate(text(out, 'puc_valid_upto')),
    challansPending: false, referenceId: requestId, found: true
  };
}

export class IdfyRegistryProvider implements RegistryProvider {
  readonly mode = 'real' as const;
  private meter: UsageMeter;
  constructor(private options: {
    rapidApiKey: string; host?: string; dailyLimit?: number; fetcher?: typeof fetch;
    timeoutMs?: number; sleep?: (ms: number) => Promise<void>;
  }) {
    this.meter = new UsageMeter('idfy', options.dailyLimit ?? 10);
  }

  async lookup(registrationNumber: string): Promise<RegistryVehicle> {
    if (!this.options.rapidApiKey.trim()) throw new RcVerificationError('RC_NOT_CONFIGURED', 503, 'RC verification is not configured on this server.');
    const registration = normaliseRegistration(registrationNumber);
    if (!REGISTRATION.test(registration)) throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
    try { this.meter.record(); } catch {
      throw new RcVerificationError('RC_DAILY_LIMIT', 429, 'The server has reached its daily RC-check limit. Try again later.');
    }
    const host = (this.options.host || IDFY_DEFAULT_HOST).trim();
    const fetcher = this.options.fetcher ?? fetch;
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const headers = { 'x-rapidapi-key': this.options.rapidApiKey, 'x-rapidapi-host': host, 'content-type': 'application/json' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 25000);
    const call = async (url: string, init: RequestInit) => {
      const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { /* handled by callers */ }
      if (!response.ok) {
        const message = typeof object(payload)?.message === 'string' ? String(object(payload)!.message) : '';
        mapIdfyHttpError(response.status, message);
      }
      return payload;
    };
    try {
      // No automatic retries of the submit: each one uses a request from the monthly quota.
      const submitted = object(await call(`https://${host}/v3/tasks/async/verify_with_source/ind_rc_plus`, {
        method: 'POST', headers,
        body: JSON.stringify({ task_id: crypto.randomUUID(), group_id: crypto.randomUUID(), data: { rc_number: registration } })
      }));
      const requestId = typeof submitted?.request_id === 'string' ? submitted.request_id : '';
      if (!requestId) {
        throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
      }
      for (const delay of POLL_DELAYS_MS) {
        await sleep(delay);
        const record = parseIdfyTask(
          await call(`https://${host}/v3/tasks?request_id=${encodeURIComponent(requestId)}`, { method: 'GET', headers }),
          registration, requestId);
        if (record) return record;
      }
      throw new RcVerificationError('RC_TIMEOUT', 504, 'RC verification is taking longer than usual. Try again in a minute.');
    } catch (error) {
      if (error instanceof RcVerificationError) throw error;
      throw new RcVerificationError(controller.signal.aborted ? 'RC_TIMEOUT' : 'RC_PROVIDER_UNAVAILABLE',
        controller.signal.aborted ? 504 : 502,
        controller.signal.aborted ? 'RC verification timed out. Try again later.' : 'The RC service could not be reached or returned unreadable data.');
    } finally { clearTimeout(timer); }
  }

  async verifyOwnership(): Promise<boolean> {
    throw new RcVerificationError('RC_OWNERSHIP_UNSUPPORTED', 422, 'An RC lookup does not prove that the caller owns the vehicle.');
  }
  status() { return this.meter.snapshot(); }
}
