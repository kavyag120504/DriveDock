/**
 * Indian vehicle registration numbers. Mirrors server/src/services/regNumber.ts — keep the two in step.
 *
 * Standard: state code + 1–2 digit RTO code + 0–3 series letters + 4 digits (MH01AB1234, DL3CAB1234)
 * Bharat (BH) series: 2-digit year + BH + 4 digits + 1–2 letters (22BH1234AB)
 */
const STATE_CODES = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK',
  'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK',
  'TN', 'TR', 'TS', 'UA', 'UK', 'UP', 'WB'
];
const STATES = STATE_CODES.join('|');
const FIRST_LETTERS = Array.from(new Set(STATE_CODES.map((c) => c[0]))).join('');

const STANDARD = new RegExp(`^(?:${STATES})[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`);
const BHARAT = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

// Every string that can still be completed into a valid number
const STANDARD_PREFIX = new RegExp(
  `^(?:[${FIRST_LETTERS}]|(?:${STATES})(?:[0-9]{1,2}(?:[A-Z]{1,3})?(?:[0-9]{1,4})?)?)$`
);
const BHARAT_PREFIX = /^(?:[0-9]{1,2}|[0-9]{2}B|[0-9]{2}BH[0-9]{0,4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;

export const REG_EXAMPLES = 'e.g. MH01AB1234, DL3CAB1234 or 22BH1234AB';

/** Uppercase, without spaces, hyphens or dots. */
export const normalizeRegNumber = (raw: string): string => raw.toUpperCase().replace(/[\s.\-]/g, '');

export const isValidRegNumber = (raw: string): boolean => {
  const reg = normalizeRegNumber(raw);
  return STANDARD.test(reg) || BHARAT.test(reg);
};

export type RegCheck =
  | { state: 'empty' }
  | { state: 'valid' }
  | { state: 'incomplete'; message: string }
  | { state: 'invalid'; message: string };

/** Live feedback while the number is being typed. */
export const checkRegNumber = (raw: string): RegCheck => {
  const reg = normalizeRegNumber(raw);
  if (!reg) return { state: 'empty' };
  if (STANDARD.test(reg) || BHARAT.test(reg)) return { state: 'valid' };
  if (/[^A-Z0-9]/.test(reg)) return { state: 'invalid', message: 'Use only letters and numbers.' };
  if (reg.length > 11) return { state: 'invalid', message: `Too long for a registration number (${REG_EXAMPLES}).` };
  if (STANDARD_PREFIX.test(reg) || BHARAT_PREFIX.test(reg)) {
    return { state: 'incomplete', message: `Keep typing: ${REG_EXAMPLES}.` };
  }
  if (/^[A-Z]{2}/.test(reg) && !new RegExp(`^(?:${STATES})`).test(reg)) {
    return { state: 'invalid', message: `"${reg.slice(0, 2)}" isn't an Indian state code. Start with one like MH, DL, KA or HR.` };
  }
  if (new RegExp(`^(?:${STATES})[A-Z]`).test(reg)) {
    return { state: 'invalid', message: `After the state code, add the RTO number, e.g. ${reg.slice(0, 2)}01.` };
  }
  if (/^[A-Z]$/.test(reg)) {
    return { state: 'invalid', message: `No state code starts with "${reg}". Start with one like MH, DL, KA or HR.` };
  }
  return {
    state: 'invalid',
    message: `Not a valid format. Use state code + RTO number + series + 4 digits (${REG_EXAMPLES}).`
  };
};
