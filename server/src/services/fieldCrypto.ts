import crypto from 'crypto';
import { ENV } from '../config/env';

/**
 * Application-level encryption for the personal details entered for a vehicle transfer
 * (AES-256-GCM). Values look like `v1:<keyId>:<iv>:<tag>:<ciphertext>`; the key id lets several keys
 * coexist, which is what makes rotation possible: every key still in the keyring can read old values,
 * while new writes use the active key. See "Transfer paperwork keys" in CLAUDE.md for the runbook.
 */

export class PaperworkKeyError extends Error {
  readonly code = 'PAPERWORK_UNAVAILABLE';
}

export interface Keyring {
  keys: Map<string, Buffer>;
  activeId: string;
}

const VERSION = 'v1';
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const DEV_KEY_ID = 'dev';

/** Parses "id:base64,id2:base64" into a keyring. Throws on anything malformed (never guesses). */
export const parseKeyring = (rawKeys: string, activeId: string, nodeEnv: string): Keyring => {
  const entries = rawKeys.split(',').map((s) => s.trim()).filter(Boolean);

  if (entries.length === 0) {
    if (nodeEnv === 'production') {
      throw new Error('PAPERWORK_ENCRYPTION_KEYS is required in production');
    }
    // Development and tests only: a fixed key so the app runs with no setup
    const devKey = crypto.createHash('sha256').update('drivedock-development-paperwork-key').digest();
    return { keys: new Map([[DEV_KEY_ID, devKey]]), activeId: DEV_KEY_ID };
  }

  const keys = new Map<string, Buffer>();
  for (const entry of entries) {
    const at = entry.indexOf(':');
    const id = at > 0 ? entry.slice(0, at) : '';
    if (!KEY_ID_RE.test(id)) throw new Error('PAPERWORK_ENCRYPTION_KEYS has an entry with a missing or invalid key id');
    if (keys.has(id)) throw new Error(`PAPERWORK_ENCRYPTION_KEYS lists key id "${id}" twice`);
    const key = Buffer.from(entry.slice(at + 1), 'base64');
    if (key.length !== 32) throw new Error(`Paperwork key "${id}" must be 32 bytes, base64 encoded`);
    keys.set(id, key);
  }

  const active = activeId || (nodeEnv === 'production' ? '' : entries[0].slice(0, entries[0].indexOf(':')));
  if (!active || !keys.has(active)) {
    throw new Error('PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID must name a key listed in PAPERWORK_ENCRYPTION_KEYS');
  }
  return { keys, activeId: active };
};

let keyring: Keyring | null = null;

export const getKeyring = (): Keyring => {
  if (!keyring) {
    keyring = parseKeyring(ENV.PAPERWORK_ENCRYPTION_KEYS, ENV.PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID, ENV.NODE_ENV);
  }
  return keyring;
};

/** Called at server start so a misconfigured production deployment fails immediately, not on first use. */
export const assertPaperworkKeyring = (): void => {
  getKeyring();
};

/** Tests and the re-encrypt script swap the keyring; pass null to go back to the environment's. */
export const setKeyring = (next: Keyring | null): void => {
  keyring = next;
};

export const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(`${VERSION}:`) && value.split(':').length === 5;

export const keyIdOf = (token: string): string | null => (isEncrypted(token) ? token.split(':')[1] : null);

export const encryptValue = (plain: string): string => {
  const { keys, activeId } = getKeyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(activeId)!, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, activeId, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
};

export const decryptValue = (token: string): string => {
  const parts = token.split(':');
  if (parts.length !== 5 || parts[0] !== VERSION) throw new PaperworkKeyError('Unrecognised encrypted value');
  const key = getKeyring().keys.get(parts[1]);
  if (!key) throw new PaperworkKeyError(`Encryption key "${parts[1]}" is not configured`);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[2], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[3], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[4], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new PaperworkKeyError('Stored value could not be decrypted');
  }
};
