import { TransferPaperwork } from '../models/TransferPaperwork';
import { decryptValue, encryptValue, getKeyring, isEncrypted, keyIdOf } from './fieldCrypto';
import { ENCRYPTED_PATHS, getPath, keyUsage } from './paperworkFields';

export interface ReencryptReport {
  activeKeyId: string;
  scanned: number;
  /** documents with at least one value under a key other than the active one */
  needingMigration: number;
  migrated: number;
  /** stored personal values per key id, so an operator can see when an old key is no longer used */
  valuesByKey: Record<string, number>;
  dryRun: boolean;
}

/**
 * Moves every stored personal value onto the active key. Safe to run repeatedly and to stop and
 * resume (it only touches values that are not already on the active key). It reads the raw collection
 * and reports counts only, never values. Run it after adding a new active key to the keyring.
 */
export const reencryptPaperwork = async ({ dryRun = false }: { dryRun?: boolean } = {}): Promise<ReencryptReport> => {
  const { activeId } = getKeyring();
  const report: ReencryptReport = { activeKeyId: activeId, scanned: 0, needingMigration: 0, migrated: 0, valuesByKey: {}, dryRun };

  const cursor = TransferPaperwork.collection.find({}).batchSize(100);
  for await (const raw of cursor) {
    report.scanned++;
    const usage = keyUsage(raw);
    for (const [id, count] of Object.entries(usage)) report.valuesByKey[id] = (report.valuesByKey[id] || 0) + count;
    if (Object.keys(usage).every((id) => id === activeId)) continue;

    report.needingMigration++;
    if (dryRun) continue;

    const set: Record<string, string> = {};
    for (const path of ENCRYPTED_PATHS) {
      const value = getPath(raw, path);
      if (isEncrypted(value) && keyIdOf(value) !== activeId) set[path] = encryptValue(decryptValue(value));
    }
    await TransferPaperwork.collection.updateOne({ _id: raw._id }, { $set: set });
    report.migrated++;
  }
  return report;
};
