import crypto from 'crypto';
import { ENV } from '../config/env';

/**
 * Private file storage. Uploaded certificates and documents are no longer reachable at a public /uploads URL.
 * Whenever the API returns a document or booking, its file link is replaced by a short-lived signed link
 * (/api/v1/files/<name>?exp=<unix seconds>&sig=<HMAC-SHA256>). The signature covers the file name and the expiry, so a
 * link cannot be edited to reach another file or to live longer, and it stops working after FILE_URL_TTL_SECONDS.
 * The links are minted only inside responses the caller was already authorised to receive.
 */
const NAME = /^[A-Za-z0-9_-]+\.(?:jpg|png|webp|pdf)$/;

const signature = (name: string, exp: number): string =>
  crypto.createHmac('sha256', ENV.FILE_URL_SECRET).update(`${name}|${exp}`).digest('hex');

/** The stored URL of one of our own uploads becomes a signed, expiring link; any other URL is returned unchanged. */
export const signFileUrl = (stored: string | null | undefined, nowMs: number = Date.now()): string => {
  if (!stored) return stored ?? '';
  let url: URL;
  try { url = new URL(stored); } catch { return stored; }
  const match = /^\/uploads\/([^/]+)$/.exec(url.pathname);
  if (!match || !NAME.test(match[1])) return stored;
  const exp = Math.floor(nowMs / 1000) + ENV.FILE_URL_TTL_SECONDS;
  return `${url.origin}/api/v1/files/${match[1]}?exp=${exp}&sig=${signature(match[1], exp)}`;
};

/** True only for a well-formed upload name, an unexpired expiry and a matching signature. */
export const verifyFileSignature = (name: string, expRaw: unknown, sigRaw: unknown, nowMs: number = Date.now()): boolean => {
  const exp = Number(expRaw);
  if (!NAME.test(name) || !Number.isInteger(exp) || exp * 1000 < nowMs) return false;
  const expected = signature(name, exp);
  const given = typeof sigRaw === 'string' ? sigRaw : '';
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

export const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf'
};
