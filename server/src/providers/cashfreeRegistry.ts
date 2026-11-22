import crypto from 'crypto';
import fs from 'fs';
import { RegistryProvider, RegistryVehicle } from './registry';
import { normaliseRegistration, RcVerificationError, registryDate } from './aryaRegistry';
import { UsageMeter } from './types';

/**
 * Cashfree Secure ID: Verify Vehicle RC (API version 2023-12-18).
 *   POST {base}/vehicle-rc   x-client-id, x-client-secret   { verification_id, vehicle_number }
 * Sandbox  https://sandbox.cashfree.com/verification  (free, fixed test plates: HJ01ME5678 VALID, HJ01ME5679 INVALID)
 * Production https://api.cashfree.com/verification   (paid wallet; IP whitelist or x-cf-signature 2FA)
 *
 * SANDBOX RESULTS ARE MOCK DATA. The provider reports testMode: true and the controller never lets a
 * test result change a document's verification. Owner name, father's name, addresses, mobile, chassis,
 * engine, financer and policy numbers are dropped here: only the allowlisted fields below leave this file.
 */

const BASES = {
  sandbox: 'https://sandbox.cashfree.com/verification',
  production: 'https://api.cashfree.com/verification'
} as const;
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

/** Maps a Cashfree error (HTTP status + body code) to a safe client-facing error. Vendor messages are never passed on. */
export function mapCashfreeError(httpStatus: number, code: string | null): never {
  const c = (code || '').toLowerCase();
  if (c === 'vehicle_rc_value_invalid' || c === 'vehicle_number_invalid') {
    throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
  }
  if (c === 'insufficient_balance') {
    throw new RcVerificationError('RC_CREDITS_UNAVAILABLE', 503, 'RC verification credits are unavailable. Contact the administrator.');
  }
  if (httpStatus === 401 || httpStatus === 403 || c === 'authentication_failed' || c === 'ip_validation_failed'
      || c.startsWith('x-client-id') || c.startsWith('x-client-secret')) {
    throw new RcVerificationError('RC_PROVIDER_AUTH_FAILED', 503, 'The RC service credentials need administrator attention.');
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    throw new RcVerificationError('RC_PROVIDER_UNAVAILABLE', 503, 'The RC service is unavailable. Try again later.');
  }
  throw new RcVerificationError('RC_PROVIDER_FAILED', 502, 'The RC service could not complete this check. No verification was granted.');
}

/** Allowlist only. In production the registry's reg_no must match the plate we asked about. */
export function parseCashfreeRcResponse(payload: unknown, registration: string, verificationId: string, testMode: boolean): RegistryVehicle {
  const body = object(payload);
  const status = body && typeof body.status === 'string' ? body.status.toUpperCase() : '';
  if (!body || !['VALID', 'INVALID'].includes(status)
      || (typeof body.verification_id === 'string' && body.verification_id !== verificationId)) {
    throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service returned an unrecognised response. No verification was granted.');
  }
  const referenceId = body.reference_id !== undefined && body.reference_id !== null ? String(body.reference_id) : verificationId;
  if (status === 'INVALID') return notFound(registration, referenceId);

  const returned = text(body, 'reg_no') ?? text(body, 'vehicle_number');
  if (!testMode) {
    // Sandbox replies are canned records that may carry a different plate; production must match exactly.
    if (!returned) {
      throw new RcVerificationError('RC_RESPONSE_INVALID', 502, 'The RC service did not return a registration number. No verification was granted.');
    }
    if (normaliseRegistration(returned) !== registration) {
      throw new RcVerificationError('RC_NUMBER_MISMATCH', 502, 'The RC service returned a different registration. No verification was granted.');
    }
  }
  const rawStatus = (text(body, 'rc_status') || '').toUpperCase();
  const blacklist = text(body, 'blacklist_status');
  const blacklisted = !!blacklist && !['NA', 'N/A', 'NONE', 'NIL', 'NO', 'FALSE', 'NOT BLACKLISTED', '0', '-'].includes(blacklist.toUpperCase());
  let regStatus: RegistryVehicle['status'] = 'unknown';
  if (blacklisted || rawStatus === 'SUSPENDED' || rawStatus === 'BLACKLISTED') regStatus = 'suspended';
  else if (rawStatus === 'SCRAPPED') regStatus = 'scrapped';
  else if (['INACTIVE', 'CANCELLED', 'DEREGISTERED', 'EXPIRED'].includes(rawStatus)) regStatus = 'inactive';
  else if (rawStatus === 'ACTIVE' || rawStatus === 'VALID') regStatus = 'active';
  const fuel = (text(body, 'type') || '').toLowerCase();
  const make = [text(body, 'vehicle_manufacturer_name'), text(body, 'model')].filter(Boolean).join(' ');
  return {
    registrationNumber: registration, status: regStatus, makeModel: make,
    fuelType: ['petrol', 'diesel', 'cng'].includes(fuel) ? fuel as 'petrol' | 'diesel' | 'cng'
      : ['electric', 'ev', 'electric(bov)'].includes(fuel) ? 'ev' : 'unknown',
    registrationDate: registryDate(text(body, 'reg_date')),
    rcValidUpto: registryDate(text(body, 'rc_expiry_date')),
    insuranceValidUpto: registryDate(text(body, 'vehicle_insurance_upto')),
    pucValidUpto: registryDate(text(body, 'pucc_upto')),
    fitnessValidUpto: null,
    challansPending: false, referenceId, found: true
  };
}

/** x-cf-signature: RSA-OAEP(SHA-1) of "<clientId>.<unix seconds>" with the dashboard public key, base64. Valid 5 minutes. */
export const cashfreeSignature = (clientId: string, publicKeyPem: string, nowMs = Date.now()): string =>
  crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
    Buffer.from(`${clientId}.${Math.floor(nowMs / 1000)}`)).toString('base64');

export class CashfreeRegistryProvider implements RegistryProvider {
  readonly mode = 'real' as const;
  readonly testMode: boolean;
  private meter: UsageMeter;
  private publicKey: string | null = null;

  constructor(private options: {
    clientId: string; clientSecret: string; environment?: 'sandbox' | 'production';
    publicKeyPath?: string; dailyLimit?: number; fetcher?: typeof fetch; timeoutMs?: number;
  }) {
    this.testMode = (options.environment ?? 'sandbox') === 'sandbox';
    this.meter = new UsageMeter('cashfree', options.dailyLimit ?? 50);
  }

  private signature(): string | null {
    const path = this.options.publicKeyPath?.trim();
    if (!path) return null;
    if (!this.publicKey) this.publicKey = fs.readFileSync(path, 'utf8');
    return cashfreeSignature(this.options.clientId, this.publicKey);
  }

  async lookup(registrationNumber: string): Promise<RegistryVehicle> {
    if (!this.options.clientId.trim() || !this.options.clientSecret.trim()) {
      throw new RcVerificationError('RC_NOT_CONFIGURED', 503, 'RC verification is not configured on this server.');
    }
    const registration = normaliseRegistration(registrationNumber);
    if (!REGISTRATION.test(registration)) throw new RcVerificationError('RC_NUMBER_INVALID', 400, 'Enter a valid vehicle registration number.');
    let signature: string | null;
    try { signature = this.signature(); } catch {
      throw new RcVerificationError('RC_PROVIDER_AUTH_FAILED', 503, 'The RC service credentials need administrator attention.');
    }
    try { this.meter.record(); } catch {
      throw new RcVerificationError('RC_DAILY_LIMIT', 429, 'The server has reached its daily RC-check limit. Try again later.');
    }
    const verificationId = `dd_${crypto.randomUUID().replace(/-/g, '')}`; // <= 50 chars, alphanumeric + underscore
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
    try {
      const headers: Record<string, string> = {
        'x-client-id': this.options.clientId, 'x-client-secret': this.options.clientSecret, 'content-type': 'application/json'
      };
      if (signature) headers['x-cf-signature'] = signature;
      // No automatic retries: each production request is billed.
      const response = await (this.options.fetcher ?? fetch)(`${BASES[this.testMode ? 'sandbox' : 'production']}/vehicle-rc`, {
        method: 'POST', redirect: 'error', signal: controller.signal, headers,
        body: JSON.stringify({ verification_id: verificationId, vehicle_number: registration })
      });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { /* handled below */ }
      if (!response.ok) {
        const body = object(payload);
        mapCashfreeError(response.status, typeof body?.code === 'string' ? body.code : null);
      }
      return parseCashfreeRcResponse(payload, registration, verificationId, this.testMode);
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
