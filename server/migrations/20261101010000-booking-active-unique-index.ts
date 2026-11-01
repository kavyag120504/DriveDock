/**
 * (a) Booking: partial unique index on {vehicleId, documentType} for active
 * (pending|confirmed) bookings — enforces "one active booking per vehicle+document".
 *
 * SAFETY: this NEVER deletes a booking. If existing data already has duplicate active
 * bookings, `up` reports them and aborts so a human can resolve them first. Run with
 * MIGRATE_DRY_RUN=1 to preview without writing.
 */
import { Db } from 'mongodb';

const DRY = () => process.env.MIGRATE_DRY_RUN === '1';
const INDEX_NAME = 'one_active_booking_per_vehicle_document';

const findDuplicates = (db: Db) =>
  db
    .collection('bookings')
    .aggregate([
      { $match: { status: { $in: ['pending', 'confirmed'] } } },
      { $group: { _id: { vehicleId: '$vehicleId', documentType: '$documentType' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray();

export async function up(db: Db): Promise<void> {
  const dups = await findDuplicates(db);
  if (dups.length > 0) {
    const msg =
      `Found ${dups.length} vehicle+documentType group(s) with multiple ACTIVE bookings. ` +
      `Resolve them manually first — this migration will not delete any booking:\n` +
      dups.map((d: any) => ` - vehicle ${d._id.vehicleId} / ${d._id.documentType}: ${d.count} active`).join('\n');
    if (DRY()) {
      console.log('[dry-run] ' + msg);
      return;
    }
    throw new Error(msg);
  }
  if (DRY()) {
    console.log(`[dry-run] No duplicate active bookings; would create partial unique index "${INDEX_NAME}".`);
    return;
  }
  await db
    .collection('bookings')
    .createIndex({ vehicleId: 1, documentType: 1 }, { unique: true, name: INDEX_NAME, partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } } });
}

export async function down(db: Db): Promise<void> {
  if (DRY()) {
    console.log(`[dry-run] would drop index "${INDEX_NAME}".`);
    return;
  }
  try {
    await db.collection('bookings').dropIndex(INDEX_NAME);
  } catch {
    // index may not exist — ignore
  }
}
