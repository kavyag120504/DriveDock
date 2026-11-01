import mongoose, { Schema, Types } from 'mongoose';

/**
 * App-wide append-only audit log. Generalises the paperwork-specific `PaperworkAudit`
 * (which stays as-is for the transfer flow) so admin approvals, verification changes,
 * officer actions, transfers, payments and account deletions all record to one place.
 *
 * NEVER store personal-data values here — only field NAMES, ids and flags. Rows are
 * written best-effort (services/auditLog.ts) and never block the request they describe.
 */

export type AuditActorRole = 'owner' | 'provider' | 'officer' | 'government' | 'admin' | 'system';

// Open string union: known actions are listed for discoverability, but any action is allowed.
export type AuditAction =
  | 'provider_status_change'
  | 'document_verified'
  | 'ownership_transfer_accepted'
  | 'payment_verified'
  | 'officer_violation_logged'
  | 'account_deleted'
  | (string & {});

export interface IAuditLog {
  _id?: Types.ObjectId;
  actorId?: Types.ObjectId | null;
  actorRole: AuditActorRole;
  action: AuditAction;
  entityType: string; // 'provider' | 'document' | 'vehicle' | 'transfer' | 'payment' | ...
  entityId?: Types.ObjectId | string | null;
  /** Field NAMES only — never values. */
  fields: string[];
  /** Ids / flags only — never PII values. */
  metadata?: Record<string, string | number | boolean>;
  ip?: string;
  at: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: {
      type: String,
      enum: ['owner', 'provider', 'officer', 'government', 'admin', 'system'],
      required: true
    },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.Mixed, default: null },
    fields: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    at: { type: Date, required: true, index: true }
  },
  { timestamps: false }
);

AuditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
