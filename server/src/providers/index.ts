/**
 * Adapter registry. The rest of the server imports { providers } from here and
 * never instantiates a vendor client directly.
 *
 * Mode selection:
 *   - payment/storage pick 'real' automatically when their credentials exist.
 *   - registry/sms/email/maps/ocr are sandbox/mock until their Phase 3+ real impls land.
 *
 * Production guarantee (Ground Rule 4): assertProductionReady() throws at startup
 * if ANY adapter is still 'sandbox' or 'mock', so a prod deploy can never silently
 * run on stubs. Called from index.ts alongside validateProductionSecrets().
 */

import { isProduction } from '../config/env';
import { AdapterMode } from './types';
import { RegistryProvider, SandboxRegistryProvider, UnconfiguredRegistryProvider } from './registry';
import { PaymentProvider, RazorpayPaymentProvider } from './payment';
import { PushProvider, ExpoPushProvider } from './push';
import { StorageProvider, FileStorageProvider } from './storage';
import { SmsProvider, EmailProvider, LogOnlySmsProvider, LogOnlyEmailProvider } from './messaging';
import { GeocodingProvider, SandboxGeocodingProvider } from './maps';
import { OcrProvider, MockOcrProvider } from './ocr';

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

// Registry real impl isn't wired yet; use the deterministic sandbox outside prod.
const registry: RegistryProvider = isProduction()
  ? new UnconfiguredRegistryProvider()
  : new SandboxRegistryProvider();

export const providers: Providers = {
  registry,
  payment: new RazorpayPaymentProvider(),
  push: new ExpoPushProvider(),
  storage: new FileStorageProvider(),
  sms: new LogOnlySmsProvider(),
  email: new LogOnlyEmailProvider(),
  geocoding: new SandboxGeocodingProvider(),
  ocr: new MockOcrProvider()
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
