import mongoose, { Schema, Types } from 'mongoose';

export type PaperworkAuditAction =
  | 'view'
  | 'update'
  | 'checklist'
  | 'sale_date_confirm'
  | 'form_download'
  | 'delete_my_details'
  | 'purge'
  | 'decrypt_failed';

/**
 * Append-only record of who touched a transfer's paperwork. It holds field NAMES, never values,
 * so it can be kept after the personal data itself has been deleted.
 */
export interface IPaperworkAudit {
  _id?: Types.ObjectId;
  transferId: Types.ObjectId;
  userId?: Types.ObjectId | null; // null for system actions such as the retention job
  role: 'seller' | 'buyer' | 'system';
  action: PaperworkAuditAction;
  fields: string[];
  form?: string;
  ip?: string;
  at: Date;
}

const PaperworkAuditSchema = new Schema<IPaperworkAudit>({
  transferId: { type: Schema.Types.ObjectId, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, default: null },
  role: { type: String, enum: ['seller', 'buyer', 'system'], required: true },
  action: {
    type: String,
    enum: ['view', 'update', 'checklist', 'sale_date_confirm', 'form_download', 'delete_my_details', 'purge', 'decrypt_failed'],
    required: true
  },
  fields: { type: [String], default: [] },
  form: String,
  ip: String,
  at: { type: Date, default: Date.now, index: true }
});

export const PaperworkAudit = mongoose.model<IPaperworkAudit>('PaperworkAudit', PaperworkAuditSchema);
