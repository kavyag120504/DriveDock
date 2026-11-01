export interface IndianState {
  code: string; // canonical two-letter code (vehicle registration prefix)
  name: string;
}

const STATES: IndianState[] = [
  { code: 'AN', name: 'Andaman and Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'DD', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'HR', name: 'Haryana' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'JK', name: 'Jammu and Kashmir' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MN', name: 'Manipur' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' },
  { code: 'PB', name: 'Punjab' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TR', name: 'Tripura' },
  { code: 'TS', name: 'Telangana' },
  { code: 'UK', name: 'Uttarakhand' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'WB', name: 'West Bengal' }
];

// Other names and older or alternative registration prefixes that map to a state above
const ALIASES: Record<string, string> = {
  orissa: 'OD',
  or: 'OD',
  pondicherry: 'PY',
  uttaranchal: 'UK',
  ua: 'UK',
  tg: 'TS',
  dn: 'DD',
  'nct of delhi': 'DL',
  'new delhi': 'DL',
  'j and k': 'JK',
  andaman: 'AN',
  nicobar: 'AN',
  'dadra and nagar haveli': 'DD',
  'daman and diu': 'DD',
  daman: 'DD',
  diu: 'DD'
};

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));
const BY_NAME = new Map(STATES.map((s) => [clean(s.name), s]));

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const lookupCode = (code: string): IndianState | null => {
  const direct = BY_CODE.get(code);
  if (direct) return direct;
  const alias = ALIASES[code.toLowerCase()];
  return alias ? BY_CODE.get(alias) ?? null : null;
};

/** Resolves a state name, alias or two-letter code to a canonical state; null when it can't be resolved. */
export const normalizeState = (input: unknown): IndianState | null => {
  if (typeof input !== 'string') return null;
  const text = clean(input);
  if (!text) return null;

  if (text.length === 2) return lookupCode(text.toUpperCase());

  const byName = BY_NAME.get(text);
  if (byName) return byName;

  const alias = ALIASES[text];
  return alias ? BY_CODE.get(alias) ?? null : null;
};

/**
 * The state a vehicle is registered in, from its registration number prefix (MH01AB1234 -> Maharashtra).
 * The recorded `region.state` is not used: the app defaults it to Maharashtra for every vehicle, so
 * trusting it would invent a registration state. Bharat-series plates (22BH1234AA) carry no state.
 */
export const registrationStateOf = (regNumber: unknown): IndianState | null => {
  if (typeof regNumber !== 'string') return null;
  const prefix = /^([A-Z]{2})/.exec(regNumber.trim().toUpperCase());
  return prefix ? lookupCode(prefix[1]) : null;
};

export const ALL_STATES: readonly IndianState[] = STATES;
