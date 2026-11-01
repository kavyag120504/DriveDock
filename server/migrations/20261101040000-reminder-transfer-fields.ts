/**
 * (d) Reminder: mark pre-existing reminders as kind='document' so the new
 * document/transfer split is explicit. transferId/taskKey/anchorDate are only set on
 * transfer reminders going forward; this migration just backfills the discriminator.
 * Reversible. MIGRATE_DRY_RUN=1 previews the count.
 */
import { Db } from 'mongodb';

const DRY = () => process.env.MIGRATE_DRY_RUN === '1';
const missing = { kind: { $exists: false } };

export async function up(db: Db): Promise<void> {
  const count = await db.collection('reminders').countDocuments(missing);
  if (DRY()) {
    console.log(`[dry-run] reminders: ${count} would be marked kind='document'.`);
    return;
  }
  await db.collection('reminders').updateMany(missing, { $set: { kind: 'document' } });
}

export async function down(db: Db): Promise<void> {
  if (DRY()) {
    console.log("[dry-run] would unset kind/transferId/taskKey/anchorDate on all reminders.");
    return;
  }
  await db.collection('reminders').updateMany({}, { $unset: { kind: '', transferId: '', taskKey: '', anchorDate: '' } });
}
