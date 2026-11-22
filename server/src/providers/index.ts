/**
 * Adapter registry. The rest of the server imports { providers } from here and
 * never instantiates a vendor client directly.
 *
 * Mode selection:
 *   - payment/storage pick 'real' automatically when their credentials exist.
 *   - registry uses Arya only when explicitly enabled; otherwise it is sandbox/unconfigured.
 *   - sms/email/maps remain sandbox/mock pending their real implementations.
 *
 * Production guarantee (Ground Rule 4): assertProductionReady() throws at startup
 * if ANY adapter is still 'sandbox' or 'mock', so a prod deploy can never silently
 * run on stubs. Called from index.ts alongside validateProductionSecrets().
 */

import { ENV, isProduction } from '../config/env';
import { AryaRegistryProvider } from './aryaRegistry';
import { ApiExpressRegistryProvider } from './apiExpressRegistry';
import { CashfreeRegistryProvider } from './cashfreeRegistry';
import { IdfyRegistryProvider } from './idfyRegistry';
import { StampmitraRegistryProvider } from './stampmitraRegistry';
import { AdapterMode } from './types';
import { RegistryProvider, SandboxRegistryProvider, UnconfiguredRegistryProvider } from './registry';
import { PaymentProvider, RazorpayPaymentProvider } from './payment';
import { PushProvider, ExpoPushProvider } from './push';
import { StorageProvider, FileStorageProvider } from './storage';
import { SmsProvider, EmailProvider, LogOnlySmsProvider, LogOnlyEmailProvider, TwilioSmsProvider, SmtpEmailProvider } from './messaging';
import { GeocodingProvider, SandboxGeocodingProvider } from './maps';
import { OcrProvider, TesseractOcrProvider } from './ocr';

export interface Providers {
  registry: RegistryProvider;
  payment: PaymentProvider;
  push: PushProvider;
  storage: StorageProvider;
  sms: SmsProvider;
  email: EmailProvider;
  geocoding: GeocodingProvider;
  ocr: OcrProvider;
}

// Explicit opt-in prevents uploads or ordinary screen loads from consuming paid credits.
const registry: RegistryProvider = ENV.RC_VERIFICATION_ENABLED
  ? ENV.RC_PROVIDER === 'stampmitra'
    ? new StampmitraRegistryProvider({ key: ENV.STAMPMITRA_API_KEY, baseUrl: ENV.STAMPMITRA_BASE_URL, dailyLimit: ENV.STAMPMITRA_RC_DAILY_LIMIT })
    : ENV.RC_PROVIDER === 'idfy'
    ? new IdfyRegistryProvider({ rapidApiKey: ENV.RAPIDAPI_KEY, host: ENV.IDFY_RC_HOST, dailyLimit: ENV.IDFY_RC_DAILY_LIMIT })
    : ENV.RC_PROVIDER === 'cashfree'
    ? new CashfreeRegistryProvider({
        clientId: ENV.CASHFREE_CLIENT_ID, clientSecret: ENV.CASHFREE_CLIENT_SECRET, environment: ENV.CASHFREE_ENV,
        publicKeyPath: ENV.CASHFREE_PUBLIC_KEY_PATH, dailyLimit: ENV.CASHFREE_RC_DAILY_LIMIT
      })
    : ENV.RC_PROVIDER === 'apiexpress'
    ? new ApiExpressRegistryProvider({
        key: ENV.APIEXPRESS_API_KEY, baseUrl: ENV.APIEXPRESS_BASE_URL, dailyLimit: ENV.APIEXPRESS_RC_DAILY_LIMIT
      })
    : new AryaRegistryProvider({ token: ENV.ARYA_API_TOKEN, dailyLimit: ENV.ARYA_RC_DAILY_LIMIT })
  : isProduction() ? new UnconfiguredRegistryProvider() : new SandboxRegistryProvider();

const sms: SmsProvider = ENV.SMS_PROVIDER === 'twilio' && ENV.TWILIO_ACCOUNT_SID && ENV.TWILIO_AUTH_TOKEN && ENV.TWILIO_FROM
  ? new TwilioSmsProvider({ accountSid: ENV.TWILIO_ACCOUNT_SID, authToken: ENV.TWILIO_AUTH_TOKEN, from: ENV.TWILIO_FROM })
  : new LogOnlySmsProvider();

const email: EmailProvider = ENV.EMAIL_PROVIDER === 'smtp' && ENV.SMTP_HOST && ENV.SMTP_FROM
  ? new SmtpEmailProvider({ host: ENV.SMTP_HOST, port: ENV.SMTP_PORT, user: ENV.SMTP_USER, pass: ENV.SMTP_PASS, from: ENV.SMTP_FROM })
  : new LogOnlyEmailProvider();

export const providers: Providers = {
  registry,
  payment: new RazorpayPaymentProvider(),
  push: new ExpoPushProvider(),
  storage: new FileStorageProvider(),
  sms,
  email,
  geocoding: new SandboxGeocodingProvider(),
  // Local Tesseract engine; the OCR_SCAN_ENABLED toggle is applied in the controller.
  ocr: new TesseractOcrProvider()
};

export function getAdapterStatus(): Array<{ adapter: string; mode: AdapterMode }> {
  return (Object.entries(providers) as Array<[string, { mode: AdapterMode }]>).map(([adapter, impl]) => ({
    adapter,
    mode: impl.mode
  }));
}

/**
 * Throws in production if any adapter is not 'real'. No-op outside production.
 * Until Phase 3 wires the registry/sms/email/ocr real implementations, this
 * deliberately blocks production boot — that is the intended guard, not a bug.
 */
export function assertProductionReady(): void {
  if (!isProduction()) return;
  const notReal = getAdapterStatus().filter((a) => a.mode !== 'real');
  if (notReal.length > 0) {
    throw new Error(
      'Refusing to start in production — these adapters are not using a real implementation:\n' +
        notReal.map((a) => ` - ${a.adapter} (${a.mode})`).join('\n')
    );
  }
}

export * from './types';
