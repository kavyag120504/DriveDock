/**
 * Baseline migration.
 *
 * The DriveDock collections pre-date the introduction of migrate-mongo, so this
 * first entry is intentionally a near no-op: it only records that the migration
 * framework is now in place (via the changelog) and ensures the indexes the
 * Mongoose models already declare exist on an existing database.
 *
 * It is fully reversible. `up` creating indexes that are already present is a
 * no-op; `down` drops only the indexes this migration would have created.
 */

import { Db } from 'mongodb';

// Indexes the models declare; creating them is idempotent (createIndex is a no-op
// when an identical index already exists). Listed here so a fresh database brought
// up purely by migrations (no seed) still gets the unique/compound indexes.
const INDEXES: Array<{ collection: string; keys: Record<string, 1 | -1>; options?: Record<string, unknown> }> = [
  { collection: 'users', keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
  { collection: 'vehicles', keys: { regNumber: 1 }, options: { unique: true, name: 'regNumber_unique' } },
  { collection: 'vehicles', keys: { qrCodeId: 1 }, options: { unique: true, name: 'qrCodeId_unique' } },
  { collection: 'documents', keys: { vehicleId: 1, type: 1 }, options: { name: 'vehicle_type' } },
  { collection: 'payments', keys: { razorpayOrderId: 1 }, options: { unique: true, name: 'rzpOrder_unique' } }
];

export async function up(db: Db): Promise<void> {
  for (const idx of INDEXES) {
    await db.collection(idx.collection).createIndex(idx.keys, idx.options);
  }
}

export async function down(db: Db): Promise<void> {
  for (const idx of INDEXES) {
    const name = (idx.options?.name as string) ?? undefined;
    if (!name) continue;
    try {
      await db.collection(idx.collection).dropIndex(name);
    } catch {
      // Index may not exist (e.g. created by Mongoose, not this migration) — ignore.
    }
  }
}
