/**
 * Form-side checks and conversions. These mirror server/src/services/paperworkValidation.ts so people
 * see problems before sending; the server stays the authority and its messages are shown as well.
 */

export interface PartyForm {
  fullName: string;
  relation: string;
  guardianName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  mobile: string;
  email: string;
  idType: string;
  idLast4: string;
}

export const emptyParty = (): PartyForm => ({
  fullName: '', relation: '', guardianName: '', line1: '', line2: '', city: '', state: '', pincode: '',
  mobile: '', email: '', idType: '', idLast4: ''
});

const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,79}$/;
const TEXT_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'/&()#:-]{1,119}$/;
const LATIN = 'Use English letters, as on your RC or Aadhaar';

export type Errors = Record<string, string>;

// ── Dates: people type DD/MM/YYYY, the server wants YYYY-MM-DD ────────────────

export const isoToDmy = (iso?: string | null): string => {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const dmyToIso = (dmy: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};

/** Adds the slashes as someone types digits. */
export const maskDmy = (text: string): string => {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

/** Today's date in India as YYYY-MM-DD. */
export const todayIso = (): string => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// ── Party ─────────────────────────────────────────────────────────────────────

export const normalizeMobile = (raw: string): string => {
  let digits = raw.replace(/[\s-]/g, '');
  digits = digits.replace(/^\+?91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
  return digits;
};

export const validateParty = (f: PartyForm, opts: { requireId: boolean }): Errors => {
  const e: Errors = {};
  if (!NAME_RE.test(f.fullName.trim())) e.fullName = `Enter your full name. ${LATIN}`;
  if (!f.relation) e.relation = 'Choose one';
  if (!NAME_RE.test(f.guardianName.trim())) e.guardianName = `Enter the name. ${LATIN}`;
  if (!TEXT_RE.test(f.line1.trim())) e.line1 = `Enter your address. ${LATIN}`;
  if (f.line2.trim() && !TEXT_RE.test(f.line2.trim())) e.line2 = LATIN;
  if (!NAME_RE.test(f.city.trim())) e.city = `Enter your city. ${LATIN}`;
  if (!f.state) e.state = 'Choose your state';
  if (!/^[1-9]\d{5}$/.test(f.pincode.trim())) e.pincode = 'Enter a 6-digit pincode';
  if (!/^[6-9]\d{9}$/.test(normalizeMobile(f.mobile))) e.mobile = 'Enter a 10-digit Indian mobile number';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (opts.requireId) {
    if (!f.idType) e.idType = 'Choose an ID type';
    const last4 = f.idLast4.trim().toUpperCase();
    const ok = /^[A-Z0-9]{4}$/.test(last4) && (f.idType !== 'aadhaar' || /^\d{4}$/.test(last4));
    if (!ok) e.idLast4 = 'Enter only the last 4 characters. We never store the full number';
  }
  return e;
};

/** Only filled-in fields are sent, so a half-finished form never blanks what is already saved. */
export const toPartyPayload = (f: PartyForm): Record<string, any> => {
  const out: Record<string, any> = {};
  const put = (key: string, value: string) => {
    if (value.trim()) out[key] = value.trim();
  };
  put('fullName', f.fullName);
  put('relation', f.relation);
  put('guardianName', f.guardianName);
  if (f.mobile.trim()) out.mobile = normalizeMobile(f.mobile);
  put('email', f.email);
  put('idType', f.idType);
  if (f.idLast4.trim()) out.idLast4 = f.idLast4.trim().toUpperCase();
  const address: Record<string, string> = {};
  if (f.line1.trim()) address.line1 = f.line1.trim();
  if (f.line2.trim()) address.line2 = f.line2.trim();
  if (f.city.trim()) address.city = f.city.trim();
  if (f.state) address.state = f.state;
  if (f.pincode.trim()) address.pincode = f.pincode.trim();
  if (Object.keys(address).length > 0) out.address = address;
  return out;
};

/** What the server saved, topped up with what we already know about the user (name, phone, city). */
export const partyFromServer = (me: any, prefill: any): PartyForm => ({
  fullName: me?.fullName || prefill?.fullName || '',
  relation: me?.relation || '',
  guardianName: me?.guardianName || '',
  line1: me?.address?.line1 || '',
  line2: me?.address?.line2 || '',
  city: me?.address?.city || prefill?.address?.city || '',
  state: me?.address?.state || prefill?.address?.state || '',
  pincode: me?.address?.pincode || prefill?.address?.pincode || '',
  mobile: me?.mobile || prefill?.mobile || '',
  email: me?.email || '',
  idType: me?.idType || '',
  idLast4: me?.idLast4 || ''
});

// ── Seller ────────────────────────────────────────────────────────────────────

export interface SellerForm {
  party: PartyForm;
  chassisNo: string;
  engineNo: string;
  colour: string;
  registrationDate: string; // DD/MM/YYYY
  saleDate: string; // DD/MM/YYYY
  price: string;
  odometer: string;
  hypothecated: '' | 'yes' | 'no';
  bankName: string;
  insurerName: string;
  policyNumber: string;
  sellerConsent: boolean;
}

export const sellerFromServer = (view: any): SellerForm => {
  const shared = view?.shared ?? {};
  return {
    party: partyFromServer(view?.me, view?.prefill),
    chassisNo: shared.vehicle?.chassisNo || '',
    engineNo: shared.vehicle?.engineNo || '',
    colour: shared.vehicle?.colour || '',
    registrationDate: isoToDmy(shared.vehicle?.registrationDate),
    saleDate: isoToDmy(shared.sale?.date),
    price: shared.sale?.price != null ? String(shared.sale.price) : '',
    odometer: shared.sale?.odometerKm != null ? String(shared.sale.odometerKm) : '',
    hypothecated: shared.loan?.hypothecated === true ? 'yes' : shared.loan?.hypothecated === false ? 'no' : '',
    bankName: shared.loan?.bankName || '',
    insurerName: shared.insurance?.insurerName || '',
    policyNumber: shared.insurance?.policyNumber || '',
    sellerConsent: shared.insurance?.sellerConsent === true
  };
};

export const validateSeller = (f: SellerForm): Errors => {
  const e = validateParty(f.party, { requireId: false });
  const prefixed: Errors = {};
  for (const [k, v] of Object.entries(e)) prefixed[`party.${k}`] = v;

  if (!/^[A-Za-z0-9]{6,25}$/.test(f.chassisNo.trim())) prefixed.chassisNo = 'Enter the chassis number from the RC (letters and digits only)';
  if (!/^[A-Za-z0-9-]{4,25}$/.test(f.engineNo.trim())) prefixed.engineNo = 'Enter the engine number from the RC';
  const reg = dmyToIso(f.registrationDate);
  if (!reg || reg > todayIso() || reg < '1960-01-01') prefixed.registrationDate = 'Enter the registration date as DD/MM/YYYY';
  const sale = dmyToIso(f.saleDate);
  if (!sale || sale > todayIso()) prefixed.saleDate = 'Enter the handover date as DD/MM/YYYY (not in the future)';
  else if (reg && sale < reg) prefixed.saleDate = 'The sale cannot be before the registration date';
  if (!/^\d{1,7}$/.test(f.odometer.trim())) prefixed.odometer = 'Enter the odometer reading in whole kilometres';
  if (f.price.trim() && !(Number(f.price) > 0 && Math.round(Number(f.price) * 100) === Number(f.price) * 100)) prefixed.price = 'Enter the price in rupees';
  if (!f.hypothecated) prefixed.hypothecated = 'Answer yes or no';
  if (f.hypothecated === 'yes' && !TEXT_RE.test(f.bankName.trim())) prefixed.bankName = 'Enter the bank or financier';
  if (f.insurerName.trim() && !TEXT_RE.test(f.insurerName.trim())) prefixed.insurerName = LATIN;
  if (f.policyNumber.trim() && !/^[A-Za-z0-9/-]{4,30}$/.test(f.policyNumber.trim())) prefixed.policyNumber = 'Enter the policy number from your policy document';
  return prefixed;
};

export const toSellerPayload = (f: SellerForm): Record<string, any> => {
  const body: Record<string, any> = { party: toPartyPayload(f.party) };
  const vehicle: Record<string, string> = {};
  if (f.chassisNo.trim()) vehicle.chassisNo = f.chassisNo.trim().toUpperCase();
  if (f.engineNo.trim()) vehicle.engineNo = f.engineNo.trim().toUpperCase();
  if (f.colour.trim()) vehicle.colour = f.colour.trim();
  const reg = dmyToIso(f.registrationDate);
  if (reg) vehicle.registrationDate = reg;
  if (Object.keys(vehicle).length) body.vehicle = vehicle;

  const sale: Record<string, any> = {};
  const saleDate = dmyToIso(f.saleDate);
  if (saleDate) sale.date = saleDate;
  if (f.price.trim()) sale.price = Number(f.price);
  if (f.odometer.trim()) sale.odometerKm = Number(f.odometer);
  if (Object.keys(sale).length) body.sale = sale;

  if (f.hypothecated) {
    body.loan = f.hypothecated === 'yes' ? { hypothecated: true, bankName: f.bankName.trim() } : { hypothecated: false };
  }
  const insurance: Record<string, any> = { sellerConsent: f.sellerConsent };
  if (f.insurerName.trim()) insurance.insurerName = f.insurerName.trim();
  if (f.policyNumber.trim()) insurance.policyNumber = f.policyNumber.trim().toUpperCase();
  body.insurance = insurance;
  return body;
};

/** Server-side validation messages, as a list for an alert. */
export const serverMessages = (err: any): string => {
  const errors = err?.response?.data?.errors;
  if (errors && typeof errors === 'object') {
    const list = Object.values(errors).filter((v) => typeof v === 'string') as string[];
    if (list.length) return list.join('\n');
  }
  return err?.response?.data?.message ?? 'Please check your details and try again.';
};
