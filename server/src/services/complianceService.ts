import { DocumentType } from '../models/Document';

export const REQUIRED_DOCUMENTS: DocumentType[] = ['rc', 'insurance', 'puc', 'license', 'fitness'];

type DocLike = { type: string; verified: boolean; status: string; expiryDate: Date };

/** A document counts towards compliance when it is provider-verified and not expired ("expiring soon" still counts). */
export const isDocumentGood = (d: DocLike, now = Date.now()): boolean =>
  d.verified && d.status !== 'expired' && new Date(d.expiryDate).getTime() >= now;

/** Same rule as the GREEN result of GET /public/verify: all five required documents present, verified and unexpired. */
export const isVehicleCompliant = (docs: DocLike[], now = Date.now()): boolean =>
  REQUIRED_DOCUMENTS.every((t) => docs.some((d) => d.type === t && isDocumentGood(d, now)));

/** A verified document can only be renewed within this many days of its expiry. */
export const RENEWAL_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns when renewal opens if the document does NOT need renewing yet: it is provider-verified,
 * not expired, and expires more than RENEWAL_WINDOW_DAYS from now. Returns null when a booking is
 * allowed (no document, unverified, expired, or inside the renewal window).
 */
export const renewalNotDueUntil = (doc: DocLike | null | undefined, now = Date.now()): Date | null => {
  if (!doc || !isDocumentGood(doc, now)) return null;
  const opensAt = new Date(doc.expiryDate).getTime() - RENEWAL_WINDOW_DAYS * DAY_MS;
  return opensAt > now ? new Date(opensAt) : null;
};
