/**
 * (c) Provider: backfill profileCompleted on providers created before that field.
 *
 * DECISION REQUIRED — which existing providers count as "profile complete"? Choose a
 * strategy via env before applying:
 *   PROVIDER_PROFILE_COMPLETE_STRATEGY=all            -> every existing provider = true
 *   PROVIDER_PROFILE_COMPLETE_STRATEGY=approved-only  -> only approved = true, others false
 * Reversible. MIGRATE_DRY_RUN=1 reports the counts for each strategy without writing.
 */
import { Db } from 'mongodb';

const DRY = () => process.env.MIGRATE_DRY_RUN === '1';
const STRATEGY = process.env.PROVIDER_PROFILE_COMPLETE_STRATEGY;
const missing = { profileCompleted: { $exists: false } };

export async function up(db: Db): Promise<void> {
  const providers = db.collection('providers');
  const total = await providers.countDocuments(missing);
  const approved = await providers.countDocuments({ ...missing, status: 'approved' });

  if (DRY()) {
    console.log(
      `[dry-run] providers missing profileCompleted: ${total} (approved: ${approved}, other: ${total - approved}). ` +
        `Set PROVIDER_PROFILE_COMPLETE_STRATEGY to 'all' or 'approved-only' before applying.`
    );
    return;
  }

  if (STRATEGY !== 'all' && STRATEGY !== 'approved-only') {
    throw new Error("Decision required: set PROVIDER_PROFILE_COMPLETE_STRATEGY='all' or 'approved-only' before running this migration.");
  }

  if (STRATEGY === 'all') {
    await providers.updateMany(missing, { $set: { profileCompleted: true } });
  } else {
    await providers.updateMany({ ...missing, status: 'approved' }, { $set: { profileCompleted: true } });
    await providers.updateMany({ ...missing, status: { $ne: 'approved' } }, { $set: { profileCompleted: false } });
  }
}

export async function down(db: Db): Promise<void> {
  if (DRY()) {
    console.log('[dry-run] would unset profileCompleted on all providers.');
    return;
  }
  await db.collection('providers').updateMany({}, { $unset: { profileCompleted: '' } });
}
