import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Centralised, validated environment configuration.
 *
 * In development and test, every value has a built-in default so the project runs
 * with zero configuration (unchanged behaviour). In production the server REFUSES
 * TO START when any security-critical secret is missing or still equals its built-in
 * default — see validateProductionSecrets(). Integration credentials (Razorpay, AWS,
 * Expo, Maps) are gated at the adapter layer instead, so the core can boot without
 * accounts that aren't provisioned yet.
 */

// Security-critical secrets. In production each MUST be set to a real value; the
// built-in value here is a development convenience only and is rejected in prod.
const INSECURE_SECRET_DEFAULTS = {
  JWT_ACCESS_SECRET: 'drivedock_jwt_access_secret_super_secure_key_2026',
  JWT_REFRESH_SECRET: 'drivedock_jwt_refresh_secret_super_secure_key_2026',
  QR_SECRET: 'drivedock_rotating_qr_compliance_secret_key_2026',
  INTERNAL_JOB_SECRET: 'drivedock_internal_cron_job_secure_secret_2026',
  TRANSFER_SECRET: 'drivedock_twin_transfer_secret_key_2026',
  TWIN_SHARE_SECRET: 'drivedock_twin_share_secret_key_2026'
} as const;

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/drivedock';
const PLACEHOLDER_RAZORPAY_KEY_ID = 'rzp_test_DriveDockDev2026';
const PLACEHOLDER_RAZORPAY_KEY_SECRET = 'rzp_test_secret_DriveDockDev2026';

// Numeric env var → number, tolerating empty/invalid values (falls back, never throws).
const numericFromEnv = (fallback: number) =>
  z.preprocess((v) => {
    if (v === '' || v === undefined || v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }, z.number().int().min(0));

// Boolean env var, parsed the way the rest of the code expects: a var is true only
// when it equals the string 'true'; anything else (incl. unset) uses the fallback.
const boolFromEnv = (fallback: boolean) =>
  z.preprocess((v) => (v === undefined || v === null || v === '' ? fallback : v === 'true'), z.boolean());

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Demo-only endpoints (station login switcher). Off unless explicitly set to 'true'.
  DEMO_MODE: boolFromEnv(false),
  // Number of reverse proxies in front of the API. Express trusts exactly this many
  // X-Forwarded-For entries, so clients can't spoof their IP for the rate limiter.
  TRUST_PROXY: numericFromEnv(0),
  MONGO_URI: z.string().min(1).default(DEFAULT_MONGO_URI),

  // Browser CORS allowlist: comma-separated origins (e.g. "https://app.drivedock.in,https://admin.drivedock.in").
  // When empty the server reflects any Origin (current/dev behaviour); the native mobile app sends no Origin
  // and is unaffected either way. Set this in production so only known web origins may call the API from a browser.
  CORS_ALLOWED_ORIGINS: z.string().default(''),

  JWT_ACCESS_SECRET: z.string().min(1).default(INSECURE_SECRET_DEFAULTS.JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(1).default(INSECURE_SECRET_DEFAULTS.JWT_REFRESH_SECRET),
  QR_SECRET: z.string().min(1).default(INSECURE_SECRET_DEFAULTS.QR_SECRET),
  INTERNAL_JOB_SECRET: z.string().min(1).default(INSECURE_SECRET_DEFAULTS.INTERNAL_JOB_SECRET),
  TRANSFER_SECRET: z.string().min(1).default(INSECURE_SECRET_DEFAULTS.TRANSFER_SECRET),
  TWIN_SHARE_SECRET: z.string().min(1).default(INSECURE_SECRET_DEFAULTS.TWIN_SHARE_SECRET),

  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  AWS_S3_BUCKET: z.string().default('drivedock-documents'),
  AWS_REGION: z.string().default('ap-south-1'),

  RAZORPAY_KEY_ID: z.string().default(PLACEHOLDER_RAZORPAY_KEY_ID),
  RAZORPAY_KEY_SECRET: z.string().default(PLACEHOLDER_RAZORPAY_KEY_SECRET),

  EXPO_ACCESS_TOKEN: z.string().default(''),
  GOOGLE_MAPS_API_KEY: z.string().default(''),

  // Lets ops disable OCR document-scanning (CPU-heavy per request) without a redeploy.
  OCR_SCAN_ENABLED: boolFromEnv(true),
  // Personal details entered for a vehicle transfer are encrypted with these keys. Format:
  // "keyId:base64Key,keyId2:base64Key2" (each key 32 bytes). New writes use the ACTIVE id; every listed
  // key can still decrypt old records, so keep old keys until a re-encrypt run and all backups using them
  // are gone (see "Transfer paperwork keys" in CLAUDE.md). Required in production; development has a fallback.
  PAPERWORK_ENCRYPTION_KEYS: z.string().default(''),
  PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID: z.string().default(''),
  // Personal details on a finished transfer are wiped this many days after the transfer was approved.
  PAPERWORK_RETENTION_DAYS: numericFromEnv(180),
  // Where the worksheets tell people to get the official Form 29 / Form 30.
  OFFICIAL_FORMS_URL: z.string().default('https://parivahan.gov.in/en/forms-all')
});

export type AppEnv = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const ENV: AppEnv = parsed.data;

export const isProduction = (): boolean => ENV.NODE_ENV === 'production';

/**
 * In production, fail fast if any security-critical secret is missing or still the
 * built-in development default. Called once at startup (index.ts) so misconfigured
 * deployments never come up with forgeable tokens. No-op outside production.
 *
 * Deep validation of the paperwork encryption keyring lives in
 * services/fieldCrypto.ts → assertPaperworkKeyring(); it is invoked from the same
 * startup path (see index.ts) so this check stays dependency-free.
 */
export function validateProductionSecrets(): void {
  if (ENV.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  for (const [key, insecureDefault] of Object.entries(INSECURE_SECRET_DEFAULTS)) {
    const value = process.env[key];
    if (!value || value === insecureDefault) {
      errors.push(`${key} is missing or still set to the built-in development default`);
    }
  }
  if (!process.env.MONGO_URI || process.env.MONGO_URI === DEFAULT_MONGO_URI) {
    errors.push('MONGO_URI is missing or pointing at the local development database');
  }
  // Demo-only endpoints (station login switcher, demo logins) must never be live in prod.
  if (process.env.DEMO_MODE === 'true') {
    errors.push('DEMO_MODE must not be enabled in production');
  }
  // Transfer paperwork PII cannot be encrypted without a real keyring in production.
  if (!process.env.PAPERWORK_ENCRYPTION_KEYS) {
    errors.push('PAPERWORK_ENCRYPTION_KEYS is required in production');
  }
  if (!process.env.PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID) {
    errors.push('PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID is required in production');
  }

  if (errors.length > 0) {
    throw new Error(
      'Refusing to start in production — fix these environment variables:\n' +
        errors.map((e) => ` - ${e}`).join('\n')
    );
  }
}

/** True when Razorpay is configured with real (non-placeholder) credentials. */
export const hasRealRazorpayKeys = (): boolean =>
  !!ENV.RAZORPAY_KEY_ID &&
  !!ENV.RAZORPAY_KEY_SECRET &&
  ENV.RAZORPAY_KEY_ID !== PLACEHOLDER_RAZORPAY_KEY_ID &&
  ENV.RAZORPAY_KEY_SECRET !== PLACEHOLDER_RAZORPAY_KEY_SECRET &&
  !ENV.RAZORPAY_KEY_ID.includes('placeholder');

/** True when AWS S3 credentials are present. */
export const hasS3Config = (): boolean =>
  !!ENV.AWS_ACCESS_KEY_ID && !!ENV.AWS_SECRET_ACCESS_KEY && !!ENV.AWS_S3_BUCKET;
