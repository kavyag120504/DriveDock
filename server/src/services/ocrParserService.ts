import { DocumentType } from '../models/Document';

export interface ParsedDates {
  issueDate: string | null;
  expiryDate: string | null;
  warning?: string;
}

interface DocTypeRules {
  issueKeywords: string[];
  expiryKeywords: string[];
  excludeKeywords: string[];
}

// Each document type prints dates under different labels and with different meanings
// (e.g. a licence's "date of birth" must never be mistaken for issue/expiry).
const RULES: Record<DocumentType, DocTypeRules> = {
  rc: {
    issueKeywords: ['registration date', 'date of registration'],
    expiryKeywords: ['valid upto', 'valid till', 'registration valid upto'],
    excludeKeywords: []
  },
  insurance: {
    issueKeywords: ['period of insurance from', 'policy start date', 'date of issue'],
    expiryKeywords: ['period of insurance to', 'policy expiry date', 'valid upto', 'valid till'],
    excludeKeywords: []
  },
  puc: {
    issueKeywords: ['test date', 'date of issue'],
    expiryKeywords: ['valid upto', 'valid till'],
    excludeKeywords: []
  },
  license: {
    issueKeywords: ['date of issue', 'doi'],
    expiryKeywords: ['valid till', 'valid upto', 'non-transport valid upto'],
    excludeKeywords: ['date of birth', 'dob', 'birth']
  },
  fitness: {
    issueKeywords: ['date of issue', 'issued on'],
    expiryKeywords: ['valid upto', 'fit upto', 'fitness upto'],
    excludeKeywords: []
  }
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

// DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
const NUMERIC_DATE_REGEX = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;
// "12 Jan 2026" / "12 January 2026"
const TEXT_DATE_REGEX = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})\b/i;

const MIN_YEAR = 1990;
const MAX_YEAR = new Date().getFullYear() + 15;

const toISO = (year: number, month: number, day: number): string | null => {
  if (year < 100) year += 2000;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime()) || d.getMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const extractFirstDate = (line: string): string | null => {
  const numeric = NUMERIC_DATE_REGEX.exec(line);
  if (numeric) {
    const iso = toISO(parseInt(numeric[3], 10), parseInt(numeric[2], 10), parseInt(numeric[1], 10));
    if (iso) return iso;
  }
  const textual = TEXT_DATE_REGEX.exec(line);
  if (textual) {
    const month = MONTH_NAMES[textual[2].toLowerCase()];
    const iso = toISO(parseInt(textual[3], 10), month, parseInt(textual[1], 10));
    if (iso) return iso;
  }
  return null;
};

/**
 * Non-authoritative suggestion only — the real validation stays in
 * documentController.uploadDocument / bookingController.updateBookingStatus.
 * A field is filled ONLY when exactly one distinct candidate date was found under
 * that field's keywords for this document type. There is deliberately no
 * positional/earliest-latest fallback: a confidently-wrong pre-filled date is worse
 * than none, so ambiguous or absent matches are left null for the user to type.
 */
export const parseDocumentDates = (lines: string[], docType: DocumentType): ParsedDates => {
  const rules = RULES[docType];
  const issueCandidates = new Set<string>();
  const expiryCandidates = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.toLowerCase();
    if (rules.excludeKeywords.some((k) => line.includes(k))) continue;

    const date = extractFirstDate(rawLine);
    if (!date) continue;

    if (rules.expiryKeywords.some((k) => line.includes(k))) {
      expiryCandidates.add(date);
    } else if (rules.issueKeywords.some((k) => line.includes(k))) {
      issueCandidates.add(date);
    }
  }

  const issueDate = issueCandidates.size === 1 ? [...issueCandidates][0] : null;
  const expiryDate = expiryCandidates.size === 1 ? [...expiryCandidates][0] : null;

  let warning: string | undefined;
  if (!issueDate && !expiryDate) {
    warning = "Couldn't read the issue or expiry date automatically — please enter them manually.";
  } else if (!issueDate) {
    warning = "Couldn't confidently read the issue date — please enter it manually.";
  } else if (!expiryDate) {
    warning = "Couldn't confidently read the expiry date — please enter it manually.";
  }

  return { issueDate, expiryDate, warning };
};
