/**
 * What each RC registry provider needs before it can answer a real lookup. DriveDock is a student project with
 * no credits at any paid provider, so every paid provider is marked "paid" and is refused unless
 * RC_ALLOW_PAID_PROVIDERS=true (which only makes sense once a provider account has credits).
 * StampMitra's free sandbox is the one runnable provider; its results are sample data (see testMode).
 */
export type RcProviderId = 'arya' | 'stampmitra' | 'cashfree' | 'idfy' | 'apiexpress';

export interface RcProviderInfo {
  label: string;
  /** 'free-sandbox': a free test environment answers (sample data). 'paid': needs credits or a paid plan. */
  access: 'free-sandbox' | 'paid';
  note: string;
}

export const RC_PROVIDER_CATALOG: Record<RcProviderId, RcProviderInfo> = {
  stampmitra: { label: 'StampMitra', access: 'free-sandbox', note: 'Free sandbox with sample data; live lookups need KYC, an IP-restricted key and a funded wallet.' },
  arya: { label: 'Arya', access: 'paid', note: 'Paid credits required; this project has none.' },
  cashfree: { label: 'Cashfree', access: 'paid', note: 'Paid wallet and business onboarding required; this project has none.' },
  idfy: { label: 'IDfy', access: 'paid', note: 'Paid RapidAPI plan required; this project has none.' },
  apiexpress: { label: 'API Express', access: 'paid', note: 'Paid plan required, and the documented API host does not resolve.' }
};

export const isPaidProvider = (id: string): boolean => RC_PROVIDER_CATALOG[id as RcProviderId]?.access === 'paid';
