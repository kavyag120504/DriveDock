/**
 * Pulls Add Vehicle form suggestions out of OCR text from an RC (registration certificate):
 * paper RC, smart-card RC or the mParivahan / DigiLocker RC screen.
 *
 * Suggestions only: the owner reviews every field before saving, and nothing read here marks
 * anything as verified. Personal data on the RC (owner name, father's name, address) and the
 * chassis / engine numbers are deliberately never extracted or returned.
 */
import { normalizeRegNumber, isValidRegNumber } from './regNumber';

export type RcFuel = 'petrol' | 'diesel' | 'ev';
export type RcVehicleType = 'car' | 'bike' | 'other';

export interface RcSuggestions {
  regNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  fuelType: RcFuel | null;
  vehicleType: RcVehicleType | null;
}

const EMPTY: RcSuggestions = { regNumber: null, make: null, model: null, year: null, fuelType: null, vehicleType: null };

// Label patterns seen on RCs. Each value is read from the rest of the same line, or the next line.
const LABELS = {
  reg: /\b(?:regn?\.?\s*(?:no|number|num)\.?|registration\s*(?:no|number)\.?|vehicle\s*(?:no|number)\.?)\s*[:\-]?/i,
  makerModel: /\bmaker\s*\/\s*model\s*[:\-]?/i,
  maker: /\b(?:maker'?s?\s*name|maker|manufacturer|mfr\.?\s*name)\s*[:\-]?/i,
  model: /\b(?:model\s*name|maker\s*model|model)\s*[:\-]?/i,
  fuel: /\b(?:fuel\s*(?:used|type)?)\s*[:\-]?/i,
  mfg: /\b(?:mfg\.?\s*(?:dt|date|yr|year)\.?|month\s*[&\-\/]?\s*(?:and\s*)?y(?:ea)?r\.?\s*of\s*mfg\.?|year\s*of\s*(?:mfg|manufacture)|manufacturing\s*date)\s*[:\-]?/i,
  regDate: /\b(?:regn?\.?\s*(?:dt|date)\.?|date\s*of\s*(?:regn|registration)\.?|registration\s*date)\s*[:\-]?/i,
  vehClass: /\b(?:veh(?:icle)?\.?\s*cl(?:ass)?\.?|class\s*of\s*vehicle)\s*[:\-]?/i
};

const clean = (s: string): string => s.replace(/[|_*~`"]/g, ' ').replace(/\s+/g, ' ').trim();

/** Value after a label on the same line, else the next non-empty line that is not itself a label. */
const valueAfter = (lines: string[], label: RegExp): string | null => {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const rest = clean(lines[i].slice(m.index + m[0].length));
    if (rest.length >= 2) return rest;
    const next = lines.slice(i + 1).map(clean).find((l) => l.length >= 2);
    if (next && !Object.values(LABELS).some((l) => l.test(next))) return next;
  }
  return null;
};

// OCR confuses letters and digits; fix them by position in the plate.
const toDigits = (s: string) => s.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8');
const toLetters = (s: string) => s.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');

/** Tries every split of a 6–11 character token into a plate, fixing letter/digit OCR swaps by position. */
const asPlate = (token: string): string | null => {
  if (token.length < 6 || token.length > 11) return null;
  // BH series: YY BH NNNN X(X)
  const bh = token.match(/^([0-9OIL]{2})(BH|8H)([0-9OILSZB]{4})([A-Z0-9]{1,2})$/);
  if (bh) {
    const plate = `${toDigits(bh[1])}BH${toDigits(bh[3])}${toLetters(bh[4])}`;
    if (isValidRegNumber(plate)) return plate;
  }
  for (let district = 1; district <= 2; district++) {
    for (let series = 0; series <= 3; series++) {
      if (2 + district + series + 4 !== token.length) continue;
      const plate =
        toLetters(token.slice(0, 2)) +
        toDigits(token.slice(2, 2 + district)) +
        toLetters(token.slice(2 + district, 2 + district + series)) +
        toDigits(token.slice(2 + district + series));
      if (isValidRegNumber(plate)) return plate;
    }
  }
  return null;
};

/** Plates on one line: single words or up to 4 adjacent words ("MH 12 AB 1234"), never part of a word. */
const plateCandidates = (line: string): string[] => {
  const words = line.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const found: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let joined = '';
    for (let j = i; j < Math.min(words.length, i + 4); j++) {
      joined += words[j];
      const plate = asPlate(joined);
      if (plate) found.push(plate);
    }
  }
  return found;
};

const findRegNumber = (lines: string[]): string | null => {
  const labelled = valueAfter(lines, LABELS.reg);
  if (labelled) {
    const fromLabel = plateCandidates(labelled)[0];
    if (fromLabel) return normalizeRegNumber(fromLabel);
  }
  for (const line of lines) {
    const hit = plateCandidates(line)[0];
    if (hit) return normalizeRegNumber(hit);
  }
  return null;
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Drops company suffixes so "MARUTI SUZUKI INDIA LTD" suggests "Maruti Suzuki".
const tidyMaker = (raw: string): string =>
  titleCase(
    raw
      .replace(/\b(?:india|indian|motors?|motor\s*company|pvt|private|ltd|limited|co|company|corporation|corp|inc)\b\.?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

const plausibleText = (s: string | null): string | null => {
  if (!s) return null;
  const v = clean(s).replace(/^[:\-]+/, '').trim();
  // Needs letters, not a date or a long number (chassis/engine numbers are skipped)
  if (v.length < 2 || v.length > 40 || !/[A-Za-z]{2}/.test(v) || /\d{6,}/.test(v)) return null;
  return v;
};

const parseFuel = (raw: string | null): RcFuel | null => {
  if (!raw) return null;
  const v = raw.toUpperCase();
  if (/ELECTRIC|BATTERY|\bEV\b|BOV/.test(v)) return 'ev';
  if (/DIESEL/.test(v)) return 'diesel';
  if (/PETROL|CNG|LPG|GASOLINE/.test(v)) return 'petrol'; // CNG/LPG kits run on petrol cars
  return null;
};

const parseVehicleType = (raw: string | null): RcVehicleType | null => {
  if (!raw) return null;
  const v = raw.toUpperCase();
  if (/M[\s\-]*CYCLE|SCOOTER|MCWG|MCWOG|2W|TWO\s*WHEEL|MOPED|MOTOR\s*CYCLE/.test(v)) return 'bike';
  if (/LMV|MOTOR\s*CAR|CAR|JEEP|SUV|4W|FOUR\s*WHEEL/.test(v)) return 'car';
  if (v.trim().length >= 2) return 'other';
  return null;
};

const parseYear = (raw: string | null): number | null => {
  if (!raw) return null;
  const now = new Date().getFullYear();
  const m = raw.match(/\b(19[89]\d|20\d{2})\b/) || raw.match(/[\/\-.](\d{2})\b/);
  if (!m) return null;
  let year = Number(m[1]);
  if (year < 100) year += year > now % 100 ? 1900 : 2000;
  return year >= 1980 && year <= now ? year : null;
};

export const parseRcText = (rawLines: string[]): RcSuggestions => {
  const lines = rawLines.map((l) => l.replace(/\r/g, '')).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { ...EMPTY };

  const result: RcSuggestions = { ...EMPTY };
  result.regNumber = findRegNumber(lines);

  // "Maker / Model: MARUTI SUZUKI / SWIFT" (mParivahan) or separate maker and model lines
  const combined = valueAfter(lines, LABELS.makerModel);
  if (combined && combined.includes('/')) {
    const [mk, ...md] = combined.split('/');
    result.make = plausibleText(mk) ? tidyMaker(mk) : null;
    result.model = plausibleText(md.join('/')) ? titleCase(clean(md.join('/'))) : null;
  }
  if (!result.make) {
    const mk = plausibleText(valueAfter(lines, LABELS.maker));
    result.make = mk ? tidyMaker(mk) || null : null;
  }
  if (!result.model) {
    const md = plausibleText(valueAfter(lines, LABELS.model));
    result.model = md ? titleCase(md) : null;
  }

  result.fuelType = parseFuel(valueAfter(lines, LABELS.fuel)) ?? parseFuel(lines.find((l) => /PETROL|DIESEL|ELECTRIC/i.test(l)) ?? null);
  result.vehicleType = parseVehicleType(valueAfter(lines, LABELS.vehClass));
  // Manufacture year first; fall back to the registration date's year
  result.year = parseYear(valueAfter(lines, LABELS.mfg)) ?? parseYear(valueAfter(lines, LABELS.regDate));

  return result;
};

/** How many of the form fields the scan could fill. */
export const countFound = (s: RcSuggestions): number => Object.values(s).filter((v) => v !== null).length;
