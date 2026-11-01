/**
 * (b) Slot: backfill capacity (default 1) and bookedCount (from the old isBooked flag)
 * on slots created before the bay-capacity model existed. Reversible. Idempotent.
 * MIGRATE_DRY_RUN=1 previews the count without writing.
 */
import { Db } from 'mongodb';

const DRY = () => process.env.MIGRATE_DRY_RUN === '1';
const missingFilter = { $or: [{ capacity: { $exists: false } }, { bookedCount: { $exists: false } }] };

export async function up(db: Db): Promise<void> {
  const count = await db.collection('slots').countDocuments(missingFilter);
  if (DRY()) {
    console.log(`[dry-run] slots: ${count} would get capacity=1 and bookedCount (= isBooked ? 1 : 0).`);
    return;
  }
  await db.collection('slots').updateMany(missingFilter, [
    {
      $set: {
        capacity: { $ifNull: ['$capacity', 1] },
        bookedCount: { $ifNull: ['$bookedCount', { $cond: [{ $eq: ['$isBooked', true] }, 1, 0] }] }
      }
    }
  ]);
}

export async function down(db: Db): Promise<void> {
  if (DRY()) {
    console.log('[dry-run] would unset capacity and bookedCount on all slots.');
    return;
  }
  await db.collection('slots').updateMany({}, { $unset: { capacity: '', bookedCount: '' } });
}
