import { decryptValue, encryptValue, isEncrypted, keyIdOf } from './fieldCrypto';

const PARTY_ENCRYPTED = [
  'fullName',
  'guardianName',
  'address.line1',
  'address.line2',
  'address.city',
  'address.pincode',
  'mobile',
  'email',
  'idLast4'
];

/**
 * Every stored field that holds personal data and is therefore encrypted at rest. Left in plain text
 * on purpose: relation, idType, address.state (the NOC and deadline checks need it), dates, price,
 * odometer, yes/no answers, the insurer's company name and the plan choice.
 */
export const ENCRYPTED_PATHS: readonly string[] = [
  ...PARTY_ENCRYPTED.map((p) => `seller.${p}`),
  ...PARTY_ENCRYPTED.map((p) => `buyer.${p}`),
  'vehicle.chassisNo',
  'vehicle.engineNo',
  'loan.bankName',
  'insurance.policyNumber'
];

export const getPath = (obj: any, path: string): unknown =>
  path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);

export const setPath = (obj: any, path: string, value: unknown): void => {
  const keys = path.split('.');
  let cur = obj;
  for (const key of keys.slice(0, -1)) {
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
};

export const isEncryptedPath = (path: string): boolean => ENCRYPTED_PATHS.includes(path);

/** Encrypts a value if its path is a personal-data path; empty values stay empty. */
export const sealValue = (path: string, value: unknown): unknown =>
  isEncryptedPath(path) && typeof value === 'string' && value !== '' ? encryptValue(value) : value;

/** Returns a copy of a stored paperwork object with every personal field decrypted. */
export const openDoc = <T extends object>(stored: T): T => {
  const copy = JSON.parse(JSON.stringify(stored));
  for (const path of ENCRYPTED_PATHS) {
    const value = getPath(copy, path);
    if (isEncrypted(value)) setPath(copy, path, decryptValue(value));
  }
  return copy;
};

/** Counts stored personal fields per key id, without decrypting anything (used by the re-encrypt report). */
export const keyUsage = (stored: object): Record<string, number> => {
  const usage: Record<string, number> = {};
  for (const path of ENCRYPTED_PATHS) {
    const id = keyIdOf(getPath(stored, path) as string);
    if (id) usage[id] = (usage[id] || 0) + 1;
  }
  return usage;
};

/** Flattens a nested patch into dotted `$set` paths, sealing personal fields on the way. */
export const flattenPatch = (patch: Record<string, any>, prefix = ''): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(out, flattenPatch(value, path));
    } else {
      out[path] = sealValue(path, value);
    }
  }
  return out;
};
