/**
 * (e) Document: the status enum now includes 'expiring_soon'. Recompute existing
 * 'valid' documents whose expiry is within 30 days so they reflect the new state the
 * reminder job will otherwise set on its next run. Reversible (expiring_soon -> valid).
 * MIGRATE_DRY_RUN=1 previews the count without writing.
 *
 * Uses the server clock at run time; pass no dates in (migrations run as a one-off job).
 */
import { Db } from 'mongodb';

const DRY = () => process.env.MIGRATE_DRY_RUN === '1';

export async function up(db: Db): Promise<void> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const filter = { status: 'valid', expiryDate: { $gt: now, $lte: in30 } };

  const count = await db.collection('documents').countDocuments(filter);
  if (DRY()) {
    console.log(`[dry-run] documents: ${count} 'valid' within 30 days would become 'expiring_soon'.`);
    return;
  }
  await db.collection('documents').updateMany(filter, { $set: { status: 'expiring_soon' } });
}

export async function down(db: Db): Promise<void> {
  if (DRY()) {
    console.log("[dry-run] would revert all 'expiring_soon' documents to 'valid'.");
    return;
  }
  await db.collection('documents').updateMany({ status: 'expiring_soon' }, { $set: { status: 'valid' } });
}
