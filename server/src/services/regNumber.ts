/**
 * Indian vehicle registration numbers. Mirrors mobile/src/utils/regNumber.ts — keep the two in step.
 *
 * Standard: state code + 1–2 digit RTO code + 0–3 series letters + 4 digits
 *   MH01AB1234, DL3CAB1234 (Delhi: district 3, series CAB), MH12A1234, KA011234
 * Bharat (BH) series: 2-digit year + BH + 4 digits + 1–2 letters
 *   22BH1234AB
 */

// State / union-territory codes in current or recent use (includes legacy OR, UA, DD, DN).
export const STATE_CODES = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK',
  'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK',
  'TN', 'TR', 'TS', 'UA', 'UK', 'UP', 'WB'
] as const;

const STATES = STATE_CODES.join('|');
const STANDARD = new RegExp(`^(?:${STATES})[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$`);
const BHARAT = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

export const REG_NUMBER_FORMAT_MESSAGE =
  'Enter a valid Indian registration number: state code + RTO number + series + 4 digits ' +
  '(e.g. MH01AB1234, DL3CAB1234) or a BH-series number (e.g. 22BH1234AB).';

/** Uppercases and removes spaces, hyphens and dots, the way plates are often written. */
export const normalizeRegNumber = (raw: string): string => raw.toUpperCase().replace(/[\s.\-]/g, '');

export const isValidRegNumber = (raw: string): boolean => {
  const reg = normalizeRegNumber(raw);
  return STANDARD.test(reg) || BHARAT.test(reg);
};
