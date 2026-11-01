import { normalizeState } from './indianStates';

export type PaperworkRole = 'seller' | 'buyer';

export interface ValidationResult {
  ok: boolean;
  /** Cleaned values, only for the fields that were sent. Party fields are under `party`. */
  patch: Record<string, any>;
  /** field path -> message */
  errors: Record<string, string>;
  /** paths the caller may not write */
  forbidden: string[];
}

const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,79}$/;
const TEXT_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'/&()#:-]{1,119}$/;
const LATIN_HINT = 'Use English letters, as written on your RC or Aadhaar';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELATIONS = ['S/o', 'D/o', 'W/o', 'C/o'];
const ID_TYPES = ['aadhaar', 'pan', 'voter', 'passport', 'dl'];

/** Today's calendar date in India (UTC+5:30) as YYYY-MM-DD. */
export const todayIST = (now: number = Date.now()): string => new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** True for a real calendar date written YYYY-MM-DD (rejects 2030-02-31). */
export const isRealIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const SELLER_KEYS: Record<string, string[] | true> = {
  party: true,
  vehicle: true,
  sale: ['date', 'price', 'odometerKm'],
  loan: true,
  insurance: ['insurerName', 'policyNumber', 'sellerConsent']
};
const BUYER_KEYS: Record<string, string[] | true> = {
  party: true,
  insurance: ['buyerPlan']
};

const PARTY_FIELDS = ['fullName', 'relation', 'guardianName', 'address', 'mobile', 'email', 'idType', 'idLast4'];
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'state', 'pincode'];
const VEHICLE_FIELDS = ['chassisNo', 'engineNo', 'colour', 'registrationDate'];
const LOAN_FIELDS = ['hypothecated', 'bankName'];
const INSURANCE_FIELDS = ['insurerName', 'policyNumber', 'sellerConsent', 'buyerPlan'];

const isPlainObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validates a paperwork update. Everything is optional (the app never blocks on missing details), but
 * whatever is sent must be valid. Unknown keys and keys the caller's role may not write are refused.
 */
export const validatePaperworkPatch = (role: PaperworkRole, body: unknown, now: number = Date.now()): ValidationResult => {
  const result: ValidationResult = { ok: true, patch: {}, errors: {}, forbidden: [] };
  const fail = (path: string, message: string) => {
    result.errors[path] = message;
  };
  const today = todayIST(now);
  const allowed = role === 'seller' ? SELLER_KEYS : BUYER_KEYS;

  if (!isPlainObject(body)) {
    fail('body', 'Send an object of fields to update');
    result.ok = false;
    return result;
  }

  for (const [section, value] of Object.entries(body)) {
    const sectionRule = allowed[section];
    const known = ['party', 'vehicle', 'sale', 'loan', 'insurance'].includes(section);
    if (!known) {
      fail(section, 'Unknown field');
      continue;
    }
    if (!sectionRule) {
      result.forbidden.push(section);
      continue;
    }
    if (!isPlainObject(value)) {
      fail(section, 'Must be an object');
      continue;
    }

    // Per-field permission inside the section
    const fieldGate = (field: string): boolean => {
      if (sectionRule === true) return true;
      if (sectionRule.includes(field)) return true;
      result.forbidden.push(`${section}.${field}`);
      return false;
    };

    if (section === 'party') validateParty(value, result, fail);
    else if (section === 'vehicle') validateVehicle(value, result, fail, today);
    else if (section === 'sale') validateSale(value, result, fail, today, fieldGate);
    else if (section === 'loan') validateLoan(value, result, fail);
    else if (section === 'insurance') validateInsurance(value, result, fail, fieldGate);
  }

  result.ok = Object.keys(result.errors).length === 0 && result.forbidden.length === 0;
  if (!result.ok) result.patch = {};
  return result;
};

type Fail = (path: string, message: string) => void;

const put = (result: ValidationResult, section: string, field: string, value: unknown) => {
  result.patch[section] = { ...(result.patch[section] || {}), [field]: value };
};

const text = (v: unknown, re: RegExp, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s.length <= max && re.test(s) ? s : null;
};

function validateParty(input: Record<string, any>, result: ValidationResult, fail: Fail) {
  for (const key of Object.keys(input)) {
    if (!PARTY_FIELDS.includes(key)) fail(`party.${key}`, 'Unknown field');
  }

  if ('fullName' in input) {
    const v = text(input.fullName, NAME_RE, 80);
    v ? put(result, 'party', 'fullName', v) : fail('party.fullName', `Enter the full name. ${LATIN_HINT}`);
  }
  if ('guardianName' in input) {
    const v = text(input.guardianName, NAME_RE, 80);
    v ? put(result, 'party', 'guardianName', v) : fail('party.guardianName', `Enter the name. ${LATIN_HINT}`);
  }
  if ('relation' in input) {
    RELATIONS.includes(input.relation) ? put(result, 'party', 'relation', input.relation) : fail('party.relation', 'Choose S/o, D/o, W/o or C/o');
  }
  if ('mobile' in input) {
    let digits = typeof input.mobile === 'string' ? input.mobile.replace(/[\s-]/g, '') : '';
    digits = digits.replace(/^\+?91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
    /^[6-9]\d{9}$/.test(digits) ? put(result, 'party', 'mobile', digits) : fail('party.mobile', 'Enter a 10-digit Indian mobile number');
  }
  if ('email' in input) {
    const e = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    e === '' || (e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      ? put(result, 'party', 'email', e)
      : fail('party.email', 'Enter a valid email address');
  }
  if ('idType' in input) {
    ID_TYPES.includes(input.idType) ? put(result, 'party', 'idType', input.idType) : fail('party.idType', 'Choose an ID type');
  }
  if ('idLast4' in input) {
    const v = typeof input.idLast4 === 'string' ? input.idLast4.trim().toUpperCase() : '';
    // Exactly four characters: a full ID number is refused, so it can never be stored
    const ok = /^[A-Z0-9]{4}$/.test(v) && (input.idType !== 'aadhaar' || /^\d{4}$/.test(v));
    ok ? put(result, 'party', 'idLast4', v) : fail('party.idLast4', 'Enter only the last 4 characters of your ID. We never store the full number');
  }

  if ('address' in input) {
    const a = input.address;
    if (!isPlainObject(a)) {
      fail('party.address', 'Must be an object');
      return;
    }
    for (const key of Object.keys(a)) {
      if (!ADDRESS_FIELDS.includes(key)) fail(`party.address.${key}`, 'Unknown field');
    }
    const addr: Record<string, string> = {};
    for (const line of ['line1', 'line2'] as const) {
      if (line in a) {
        const v = a[line] === '' ? '' : text(a[line], TEXT_RE, 120);
        v !== null ? (addr[line] = v) : fail(`party.address.${line}`, `Enter the address. ${LATIN_HINT}`);
      }
    }
    if ('city' in a) {
      const v = text(a.city, NAME_RE, 80);
      v ? (addr.city = v) : fail('party.address.city', `Enter the city. ${LATIN_HINT}`);
    }
    if ('state' in a) {
      const s = normalizeState(a.state);
      s ? (addr.state = s.name) : fail('party.address.state', 'Choose a state from the list');
    }
    if ('pincode' in a) {
      typeof a.pincode === 'string' && /^[1-9]\d{5}$/.test(a.pincode.trim())
        ? (addr.pincode = a.pincode.trim())
        : fail('party.address.pincode', 'Enter a 6-digit pincode');
    }
    if (Object.keys(addr).length > 0) result.patch.party = { ...(result.patch.party || {}), address: addr };
  }
}

function validateVehicle(input: Record<string, any>, result: ValidationResult, fail: Fail, today: string) {
  for (const key of Object.keys(input)) {
    if (!VEHICLE_FIELDS.includes(key)) fail(`vehicle.${key}`, 'Unknown field');
  }
  if ('chassisNo' in input) {
    const v = typeof input.chassisNo === 'string' ? input.chassisNo.trim().toUpperCase() : '';
    /^[A-Z0-9]{6,25}$/.test(v) ? put(result, 'vehicle', 'chassisNo', v) : fail('vehicle.chassisNo', 'Enter the chassis number from the RC (letters and digits only)');
  }
  if ('engineNo' in input) {
    const v = typeof input.engineNo === 'string' ? input.engineNo.trim().toUpperCase() : '';
    /^[A-Z0-9-]{4,25}$/.test(v) ? put(result, 'vehicle', 'engineNo', v) : fail('vehicle.engineNo', 'Enter the engine number from the RC');
  }
  if ('colour' in input) {
    const v = input.colour === '' ? '' : text(input.colour, TEXT_RE, 40);
    v !== null ? put(result, 'vehicle', 'colour', v) : fail('vehicle.colour', `Enter the colour. ${LATIN_HINT}`);
  }
  if ('registrationDate' in input) {
    const v = input.registrationDate;
    isRealIsoDate(v) && v >= '1960-01-01' && v <= today
      ? put(result, 'vehicle', 'registrationDate', v)
      : fail('vehicle.registrationDate', 'Enter the registration date from the RC (not in the future)');
  }
}

function validateSale(input: Record<string, any>, result: ValidationResult, fail: Fail, today: string, gate: (f: string) => boolean) {
  for (const key of Object.keys(input)) {
    if (!['date', 'price', 'odometerKm'].includes(key)) fail(`sale.${key}`, 'Unknown field');
    else gate(key);
  }
  if ('date' in input) {
    const v = input.date;
    isRealIsoDate(v) && v >= '1960-01-01' && v <= today
      ? put(result, 'sale', 'date', v)
      : fail('sale.date', 'Enter the date the vehicle was handed over (not in the future)');
  }
  if ('price' in input) {
    const n = Number(input.price);
    Number.isFinite(n) && n > 0 && n <= 100_000_000 && Math.round(n * 100) === n * 100
      ? put(result, 'sale', 'price', n)
      : fail('sale.price', 'Enter the sale price in rupees (more than 0, at most 2 decimals)');
  }
  if ('odometerKm' in input) {
    const n = Number(input.odometerKm);
    Number.isInteger(n) && n >= 0 && n <= 2_000_000
      ? put(result, 'sale', 'odometerKm', n)
      : fail('sale.odometerKm', 'Enter the odometer reading in whole kilometres');
  }
}

function validateLoan(input: Record<string, any>, result: ValidationResult, fail: Fail) {
  for (const key of Object.keys(input)) {
    if (!LOAN_FIELDS.includes(key)) fail(`loan.${key}`, 'Unknown field');
  }
  if ('hypothecated' in input) {
    if (typeof input.hypothecated === 'boolean') {
      put(result, 'loan', 'hypothecated', input.hypothecated);
      // No loan means no bank to record
      if (!input.hypothecated) put(result, 'loan', 'bankName', '');
    } else {
      fail('loan.hypothecated', 'Answer yes or no');
    }
  }
  if ('bankName' in input && input.hypothecated !== false) {
    const v = text(input.bankName, TEXT_RE, 80);
    v ? put(result, 'loan', 'bankName', v) : fail('loan.bankName', `Enter the bank or financier. ${LATIN_HINT}`);
  }
}

function validateInsurance(input: Record<string, any>, result: ValidationResult, fail: Fail, gate: (f: string) => boolean) {
  for (const key of Object.keys(input)) {
    if (!INSURANCE_FIELDS.includes(key)) fail(`insurance.${key}`, 'Unknown field');
    else gate(key);
  }
  if ('insurerName' in input) {
    const v = text(input.insurerName, TEXT_RE, 80);
    v ? put(result, 'insurance', 'insurerName', v) : fail('insurance.insurerName', `Enter the insurer. ${LATIN_HINT}`);
  }
  if ('policyNumber' in input) {
    const v = typeof input.policyNumber === 'string' ? input.policyNumber.trim().toUpperCase() : '';
    /^[A-Z0-9/-]{4,30}$/.test(v) ? put(result, 'insurance', 'policyNumber', v) : fail('insurance.policyNumber', 'Enter the policy number from your policy document');
  }
  if ('sellerConsent' in input) {
    typeof input.sellerConsent === 'boolean' ? put(result, 'insurance', 'sellerConsent', input.sellerConsent) : fail('insurance.sellerConsent', 'Answer yes or no');
  }
  if ('buyerPlan' in input) {
    ['transfer', 'new'].includes(input.buyerPlan) ? put(result, 'insurance', 'buyerPlan', input.buyerPlan) : fail('insurance.buyerPlan', 'Choose transfer the policy or buy a new one');
  }
}
