import crypto from 'crypto';
import { RegistryProvider, RegistryVehicle } from './registry';
import { normaliseRegistration, RcVerificationError, registryDate } from './aryaRegistry';
import { UsageMeter } from './types';

/**
 * API Express (apiexpress.in) Vehicle RC Verification adapter.
 *   POST {base}/v1/rc/verify   Authorization: Bearer <key>   { "rc_number": "MH12AB1234" }
 * Production: https://api.apiexpress.in (sk_live_ keys). Sandbox: https://sandbox.api.apiexpress.in (sk_test_ keys).
 *
 * The documented success body has no registration date, RC validity or registration status, so a lookup
 * can show that a record exists but can never reach "verified" (see rcVerificationController). Owner
 * name and every other personal field are dropped here: only the allowlisted fields below leave this file.
 */

const PRODUCTION_BASE = 'https://api.apiexpress.in';
const SANDBOX_BASE = 'https://sandbox.api.apiexpress.in';
const REGISTRATION = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const text = (data: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export const apiExpressBaseUrl = (key: string, override = ''): string =>
  (override.trim() || (key.startsWith('sk_test_') ? SANDBOX_BASE : PRODUCTION_BASE)).replace(/\/+$/, '');

const notFound = (registration: string, referenceId: string): RegistryVehicle => ({
  registrationNumber: registration, status: 'unknown', makeModel: '', fuelType: 'unknown',
  registrationDate: null, rcValidUpto: null, insuranceValidUpto: null, pucValidUpto: null,
  fitnessValidUpto: null, challansPending: false, referenceId, found: false
});

/** Maps an API Express error (HTTP status + optional body code) to a safe, client-facing error or a not-found record. */
export function mapApiExpressError(httpStatus: number, code: string | null, registration: string, referenceId: string): RegistryVehicle {
  const c = (code || '').toUpperCase();
  if (['NOT_FOUND', 'NO_DATA', 'VERIFICATION_FAILED'].includes(c)) return notFound(registration, referenceId);
  if (['INVALID_RC_NUMBER', 'INVALID_PARAMETER', 'MISSING_PARAMETER'].includes(c)) {
    throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
  }
  if (['QUOTA_EXCEEDED', 'DAILY_LIMIT_EXCEEDED'].includes(c)) {
    throw new RcVerificationError('RC_CREDITS_UNAVAILABLE', 503, 'RC verification credits are unavailable. Contact the administrator.');
  }
  if (['MISSING_API_KEY', 'INVALID_API_KEY', 'REVOKED_API_KEY', 'EXPIRED_API_KEY', 'API_NOT_AVAILABLE', 'IP_NOT_WHITELISTED'].includes(c)
      || httpStatus === 401 || httpStatus === 403) {
    throw new RcVerificationError('RC_PROVIDER_AUTH_FAILED', 503, 'The RC service credentials need administrator attention.');
  }
  if (httpStatus === 404) return notFound(registration, referenceId);
  if (httpStatus === 429 || httpStatus >= 500) {
    throw new RcVerificationError('RC_PROVIDER_UNAVAILABLE', 503, 'The RC service is unavailable. Try again later.');
  }
  throw new RcVerificationError('RC_PROVIDER_FAILED', 502, 'The RC service could not complete this check. No verification was granted.');
}

/** Allowlist only. owner_name, addresses, chassis/engine numbers and anything else never leave this function. */
export function parseApiExpressRcResponse(payload: unknown, registration: string, referenceId: string): RegistryVehicle {
  const body = object(payload);
  if (!body || body.status !== 'success') {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  const data = object(body.data) ?? body; // documented as top-level fields; tolerate a "data" wrapper
  const echoed = text(data, ['rc_number', 'registration_number']);
  if (echoed && normaliseRegistration(echoed) !== registration) {
    throw new RcVerificationError('RC_NUMBER_MISMATCH', 502, 'The RC service returned a different registration. No verification was granted.');
  }
  const rawStatus = (text(data, ['rc_status', 'registration_status']) || '').toUpperCase();
  const blacklist = text(data, ['blacklist_status']);
  const blacklisted = !!blacklist && !['NA', 'N/A', 'NONE', 'NIL', 'NO', 'FALSE', 'NOT BLACKLISTED', '0', '-'].includes(blacklist.toUpperCase());
  let status: RegistryVehicle['status'] = 'unknown'; // the documented response states no registration status
  if (blacklisted || rawStatus === 'SUSPENDED' || rawStatus === 'BLACKLISTED') status = 'suspended';
  else if (rawStatus === 'SCRAPPED') status = 'scrapped';
  else if (['INACTIVE', 'CANCELLED', 'DEREGISTERED', 'EXPIRED'].includes(rawStatus)) status = 'inactive';
  else if (rawStatus === 'ACTIVE' || rawStatus === 'VALID') status = 'active';
  const fuel = (text(data, ['fuel', 'fuel_type']) || '').toLowerCase();
  return {
    registrationNumber: registration, status,
    makeModel: text(data, ['vehicle', 'maker_model']) || '',
    fuelType: ['petrol', 'diesel', 'cng'].includes(fuel) ? fuel as 'petrol' | 'diesel' | 'cng'
      : ['electric', 'ev', 'electric(bov)'].includes(fuel) ? 'ev' : 'unknown',
    registrationDate: registryDate(text(data, ['registration_date'])),
    rcValidUpto: registryDate(text(data, ['rc_valid_upto', 'rc_validity', 'rc_expiry_date', 'registration_valid_upto'])),
    fitnessValidUpto: registryDate(text(data, ['fit_up_to', 'fitness_valid_upto', 'fitness_upto'])),
    insuranceValidUpto: registryDate(text(data, ['insurance_upto', 'insurance_expiry'])),
    pucValidUpto: registryDate(text(data, ['pucc_upto', 'puc_upto'])),
    challansPending: false, referenceId, found: true
  };
}

export class ApiExpressRegistryProvider implements RegistryProvider {
  readonly mode = 'real' as const;
  private meter: UsageMeter;
  constructor(private options: { key: string; baseUrl?: string; dailyLimit?: number; fetcher?: typeof fetch; timeoutMs?: number }) {
    this.meter = new UsageMeter('apiexpress', options.dailyLimit ?? 50);
  }

  async lookup(registrationNumber: string): Promise<RegistryVehicle> {
    if (!this.options.key.trim()) throw new RcVerificationError('RC_NOT_CONFIGURED', 503, 'RC verification is not configured on this server.');
    const registration = normaliseRegistration(registrationNumber);
    if (!REGISTRATION.test(registration)) throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
    try { this.meter.record(); } catch {
      throw new RcVerificationError('RC_DAILY_LIMIT', 429, 'The server has reached its daily RC-check limit. Try again later.');
    }
    const referenceId = crypto.randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
    try {
      // No automatic retries: every request can use a free-tier call.
      const response = await (this.options.fetcher ?? fetch)(
        `${apiExpressBaseUrl(this.options.key, this.options.baseUrl)}/v1/rc/verify`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${this.options.key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ rc_number: registration })
        });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { /* handled below */ }
      const body = object(payload);
      if (!response.ok || body?.status === 'error') {
        const code = typeof body?.code === 'string' ? body.code : null;
        return mapApiExpressError(response.ok ? Number(body?.http_status) || 502 : response.status, code, registration, referenceId);
      }
      return parseApiExpressRcResponse(payload, registration,
        typeof body?.request_id === 'string' && body.request_id ? body.request_id : referenceId);
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
