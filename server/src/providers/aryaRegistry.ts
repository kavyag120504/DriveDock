import crypto from 'crypto';
import { RegistryProvider, RegistryVehicle } from './registry';
import { AdapterError, UsageMeter } from './types';

const ENDPOINT = 'https://ping.arya.ai/api/v1/rc-verification';
export const normaliseRegistration = (value: string): string => value.toUpperCase().replace(/[\s-]/g, '');
const REGISTRATION = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

export class RcVerificationError extends AdapterError {
  constructor(public code: string, public httpStatus: number, message: string) {
    super('arya', message, undefined, false);
  }
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const field = (data: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

/** Strict calendar-date parsing: never guess ambiguous locale dates or roll invalid days forward. */
export const registryDate = (value: string | null): string | null => {
  if (!value) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  const indian = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
  if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else if (indian) { d = Number(indian[1]); m = Number(indian[2]); y = Number(indian[3]); }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10) : null;
};

/** Allowlist only. Raw responses, names, addresses, policy numbers and chassis/engine values never leave this adapter. */
export function parseAryaRcResponse(payload: unknown, registration: string, requestId: string): RegistryVehicle {
  const body = object(payload);
  if (!body || typeof body.success !== 'boolean' ||
      (body.req_id !== undefined && body.req_id !== requestId)) {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  if (!body.success) {
    const error = typeof body.error_message === 'string' ? body.error_message : '';
    if (/credit|balance|subscription|quota/i.test(error)) {
      throw new RcVerificationError('RC_CREDITS_UNAVAILABLE', 503, 'RC verification credits are unavailable. Contact the administrator.');
    }
    if (/token|unauthori[sz]ed|authentication/i.test(error)) {
      throw new RcVerificationError('RC_PROVIDER_AUTH_FAILED', 503, 'The RC service credentials need administrator attention.');
    }
    if (/not found|no record|invalid\s+(?:rc|registration)/i.test(error)) {
      return { registrationNumber: registration, status: 'unknown', makeModel: '', fuelType: 'unknown',
        registrationDate: null, rcValidUpto: null, insuranceValidUpto: null, pucValidUpto: null,
        fitnessValidUpto: null, challansPending: false, referenceId: requestId, found: false };
    }
    throw new RcVerificationError('RC_PROVIDER_FAILED', 502, 'The RC service could not complete this check. No verification was granted.');
  }
  const data = object(body.data);
  const returnedReg = data && field(data, ['rc_number', 'rc_num', 'registration_number', 'registration_no']);
  if (!data || !returnedReg) {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service did not return a registration number. No verification was granted.');
  }
  if (normaliseRegistration(returnedReg) !== registration) {
    throw new RcVerificationError('RC_NUMBER_MISMATCH', 502, 'The RC service returned a different registration. No verification was granted.');
  }
  const rawStatus = (field(data, ['rc_status', 'registration_status']) || '').toUpperCase();
  const blacklist = field(data, ['blacklist_status']);
  const blacklisted = !!blacklist && !['NA', 'N/A', 'NONE', 'NIL', 'NO', 'FALSE', 'NOT BLACKLISTED', '0', '-'].includes(blacklist.toUpperCase());
  let status: RegistryVehicle['status'] = 'unknown';
  if (blacklisted || rawStatus === 'SUSPENDED' || rawStatus === 'BLACKLISTED') status = 'suspended';
  else if (rawStatus === 'SCRAPPED') status = 'scrapped';
  else if (['INACTIVE', 'CANCELLED', 'DEREGISTERED', 'EXPIRED'].includes(rawStatus)) status = 'inactive';
  else if (rawStatus === 'ACTIVE' || rawStatus === 'VALID') status = 'active';
  const fuel = (field(data, ['fuel_type']) || '').toLowerCase();
  return {
    registrationNumber: registration, status,
    makeModel: field(data, ['maker_model']) || '',
    fuelType: ['petrol', 'diesel', 'cng'].includes(fuel) ? fuel as 'petrol' | 'diesel' | 'cng'
      : ['electric', 'ev', 'electric(bov)'].includes(fuel) ? 'ev' : 'unknown',
    registrationDate: registryDate(field(data, ['registration_date'])),
    // fit_up_to is FITNESS validity, not an explicit RC expiry. Do not substitute it.
    rcValidUpto: registryDate(field(data, ['rc_valid_upto', 'rc_validity', 'rc_expiry_date', 'registration_valid_upto'])),
    fitnessValidUpto: registryDate(field(data, ['fit_up_to', 'fitness_valid_upto'])),
    insuranceValidUpto: registryDate(field(data, ['insurance_upto'])),
    pucValidUpto: registryDate(field(data, ['pucc_upto'])),
    challansPending: false, referenceId: requestId, found: true
  };
}

export class AryaRegistryProvider implements RegistryProvider {
  readonly mode = 'real' as const;
  private meter: UsageMeter;
  constructor(private options: { token: string; dailyLimit?: number; fetcher?: typeof fetch; timeoutMs?: number }) {
    this.meter = new UsageMeter('arya', options.dailyLimit ?? 50);
  }

  async lookup(registrationNumber: string): Promise<RegistryVehicle> {
    if (!this.options.token.trim()) throw new RcVerificationError('RC_NOT_CONFIGURED', 503, 'RC verification is not configured on this server.');
    const registration = normaliseRegistration(registrationNumber);
    if (!REGISTRATION.test(registration)) throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
    try { this.meter.record(); } catch {
      throw new RcVerificationError('RC_DAILY_LIMIT', 429, 'The server has reached its daily RC-check limit. Try again later.');
    }
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
    try {
      // No automatic retries: each request can consume a provider credit.
      const response = await (this.options.fetcher ?? fetch)(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { token: this.options.token, 'content-type': 'application/json' },
        body: JSON.stringify({ rc_num: registration, req_id: requestId })
      });
      if (!response.ok) {
        const auth = response.status === 401 || response.status === 403;
        throw new RcVerificationError(auth ? 'RC_PROVIDER_AUTH_FAILED' : 'RC_PROVIDER_UNAVAILABLE', 503,
          auth ? 'The RC service credentials need administrator attention.' : 'The RC service is unavailable. Try again later.');
      }
      const payload: unknown = await response.json();
      return parseAryaRcResponse(payload, registration, requestId);
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
