import { DocumentType } from '../models/Document';

export const REQUIRED_DOCUMENTS: DocumentType[] = ['rc', 'insurance', 'puc', 'license', 'fitness'];

type DocLike = { type: string; verified: boolean; status: string; expiryDate: Date };

/** A document counts towards compliance when it is provider-verified and not expired ("expiring soon" still counts). */
export const isDocumentGood = (d: DocLike, now = Date.now()): boolean =>
  d.verified && d.status !== 'expired' && new Date(d.expiryDate).getTime() >= now;

/** Same rule as the GREEN result of GET /public/verify: all five required documents present, verified and unexpired. */
export const isVehicleCompliant = (docs: DocLike[], now = Date.now()): boolean =>
  REQUIRED_DOCUMENTS.every((t) => docs.some((d) => d.type === t && isDocumentGood(d, now)));
