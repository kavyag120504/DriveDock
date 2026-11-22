import { RegistryProvider, RegistryVehicle } from './registry';
import { normaliseRegistration, RcVerificationError, registryDate } from './aryaRegistry';
import { UsageMeter } from './types';

/**
 * StampMitra "Verify Vehicle RC" (developer.stampmitra.in).
 *   POST {base}/v1/verify/rc   Authorization: Bearer <key>   { "vehicleNumber": "MH12AB1234" }
 * One host for both environments: a key starting sk_test_ is the free sandbox (sample data, never debits the
 * wallet); sk_live_ is production (KYC-approved organisation, ₹9 per successful call, IP-allowlisted key).
 *
 * SANDBOX RESULTS ARE SAMPLE DATA. The provider reports testMode: true for sk_test_ keys and the controller
 * never lets a test result change a document. The documented response has an explicit RC expiry date, so a
 * live lookup can reach "verified". Owner name, father's name, chassis, engine and colour are dropped here.
 */

const DEFAULT_BASE = 'https://api-b2b.stampmitra.in';
const REGISTRATION = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const text = (data: Record<string, unknown>, key: string): string | null => {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const notFound = (registration: string, referenceId: string): RegistryVehicle => ({
  registrationNumber: registration, status: 'unknown', makeModel: '', fuelType: 'unknown',
  registrationDate: null, rcValidUpto: null, insuranceValidUpto: null, pucValidUpto: null,
  fitnessValidUpto: null, challansPending: false, referenceId, found: false
});

/** Maps an error response (HTTP status + body.error.code) to a safe client-facing error. Vendor text is never passed on. */
export function mapStampmitraError(httpStatus: number, code: string | null): never {
  const c = (code || '').toUpperCase();
  if (httpStatus === 400 || c === 'BAD_REQUEST') {
    throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
  }
  if (httpStatus === 402 || c === 'PAYMENT_REQUIRED') {
    throw new RcVerificationError('RC_CREDITS_UNAVAILABLE', 503, 'RC verification credits are unavailable. Contact the administrator.');
  }
  if (httpStatus === 401 || httpStatus === 403 || c === 'UNAUTHORIZED' || c === 'FORBIDDEN') {
    throw new RcVerificationError('RC_PROVIDER_AUTH_FAILED', 503, 'The RC service credentials need administrator attention.');
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    throw new RcVerificationError('RC_PROVIDER_UNAVAILABLE', 503, 'The RC service is unavailable. Try again later.');
  }
  throw new RcVerificationError('RC_PROVIDER_FAILED', 502, 'The RC service could not complete this check. No verification was granted.');
}

/**
 * Allowlist only. The provider documents just one status pair (registrationStatus VALID with rcStatus ACTIVE),
 * so only that pair counts as active; any other combination stays "unknown" and is never granted.
 */
export function parseStampmitraRcResponse(payload: unknown, registration: string, testMode: boolean): RegistryVehicle {
  const body = object(payload);
  const referenceId = body && text(body, 'referenceId');
  if (!body || !referenceId) {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  // Negative determinations are completed (and billed) lookups: referenceId present, found/valid false.
  if (body.found === false || body.valid === false) return notFound(registration, referenceId);

  const returned = text(body, 'regNo');
  if (!returned) return notFound(registration, referenceId);
  if (!testMode && normaliseRegistration(returned) !== registration) {
    // Sandbox replies are canned records that can carry a different plate; production must match exactly.
    throw new RcVerificationError('RC_NUMBER_MISMATCH', 502, 'The RC service returned a different registration. No verification was granted.');
  }
  const reg = (text(body, 'registrationStatus') || '').toUpperCase();
  const rc = (text(body, 'rcStatus') || '').toUpperCase();
  const either = (list: string[]) => list.includes(reg) || list.includes(rc);
  let status: RegistryVehicle['status'] = 'unknown';
  if (either(['SUSPENDED', 'BLACKLISTED'])) status = 'suspended';
  else if (either(['SCRAPPED'])) status = 'scrapped';
  else if (either(['INACTIVE', 'CANCELLED', 'DEREGISTERED', 'EXPIRED'])) status = 'inactive';
  else if (reg === 'VALID' && rc === 'ACTIVE') status = 'active';
  return {
    registrationNumber: registration, status,
    makeModel: [text(body, 'vehicleManufacturerName'), text(body, 'model')].filter(Boolean).join(' '),
    fuelType: 'unknown', // not in the documented response
    registrationDate: registryDate(text(body, 'registrationDate')),
    rcValidUpto: registryDate(text(body, 'rcExpiryDate')),
    insuranceValidUpto: registryDate(text(body, 'insuranceUpto')),
    pucValidUpto: null, fitnessValidUpto: null,
    challansPending: false, referenceId, found: true
  };
}

export class StampmitraRegistryProvider implements RegistryProvider {
  readonly mode = 'real' as const;
  readonly testMode: boolean;
  private meter: UsageMeter;

  constructor(private options: { key: string; baseUrl?: string; dailyLimit?: number; fetcher?: typeof fetch; timeoutMs?: number }) {
    this.testMode = options.key.trim().startsWith('sk_test_');
    this.meter = new UsageMeter('stampmitra', options.dailyLimit ?? 50);
  }

  async lookup(registrationNumber: string): Promise<RegistryVehicle> {
    if (!this.options.key.trim()) throw new RcVerificationError('RC_NOT_CONFIGURED', 503, 'RC verification is not configured on this server.');
    const registration = normaliseRegistration(registrationNumber);
    if (!REGISTRATION.test(registration)) throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
    try { this.meter.record(); } catch {
      throw new RcVerificationError('RC_DAILY_LIMIT', 429, 'The server has reached its daily RC-check limit. Try again later.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
    try {
      // No automatic retries: every live request is billed.
      const response = await (this.options.fetcher ?? fetch)(
        `${(this.options.baseUrl?.trim() || DEFAULT_BASE).replace(/\/+$/, '')}/v1/verify/rc`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${this.options.key.trim()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ vehicleNumber: registration })
        });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        const code = object(object(payload)?.error)?.code;
        mapStampmitraError(response.status, typeof code === 'string' ? code : null);
      }
      return parseStampmitraRcResponse(payload, registration, this.testMode);
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
