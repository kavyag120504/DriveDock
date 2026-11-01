import { Types } from 'mongoose';
import { PaperworkAudit, PaperworkAuditAction } from '../models/PaperworkAudit';

interface AuditEntry {
  transferId: Types.ObjectId | string;
  userId?: Types.ObjectId | string | null;
  role: 'seller' | 'buyer' | 'system';
  action: PaperworkAuditAction;
  /** Field NAMES only. Never pass values. */
  fields?: string[];
  form?: string;
  ip?: string;
}

/** Records an access. A failure to log is reported but never breaks the request itself. */
export const audit = async (entry: AuditEntry): Promise<void> => {
  try {
    await PaperworkAudit.create({ ...entry, fields: entry.fields ?? [], at: new Date() });
  } catch (err: any) {
    console.error('[PaperworkAudit] could not write audit row:', err?.message);
  }
};
