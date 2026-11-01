import { Types } from 'mongoose';
import { AuditLog, AuditAction, AuditActorRole } from '../models/AuditLog';

export interface AuditEntry {
  actorId?: Types.ObjectId | string | null;
  actorRole: AuditActorRole;
  action: AuditAction;
  entityType: string;
  entityId?: Types.ObjectId | string | null;
  /** Field NAMES only. Never pass PII values. */
  fields?: string[];
  /** Ids / flags only. Never pass PII values. */
  metadata?: Record<string, string | number | boolean>;
  ip?: string;
}

/**
 * Records an audit row. Best-effort: a logging failure is reported but never breaks
 * the request it describes. Mirrors the paperwork `audit()` helper so call sites feel
 * the same.
 */
export const recordAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await AuditLog.create({
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      fields: entry.fields ?? [],
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? '',
      at: new Date()
    });
  } catch (err: any) {
    console.error('[AuditLog] could not write audit row:', err?.message);
  }
};
