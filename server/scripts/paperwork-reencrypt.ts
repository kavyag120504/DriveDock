/**
 * Re-encrypts stored transfer paperwork onto the active key (see "Transfer paperwork keys" in CLAUDE.md).
 *
 *   npm run paperwork:reencrypt -- --report     show how many values sit under each key (changes nothing)
 *   npm run paperwork:reencrypt -- --dry-run    same, and says how many documents would be migrated
 *   npm run paperwork:reencrypt                 migrate
 *
 * Output is counts only; no personal data is ever printed.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { ENV } from '../src/config/env';
import { assertPaperworkKeyring } from '../src/services/fieldCrypto';
import { reencryptPaperwork } from '../src/services/paperworkMaintenance';

const run = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('--report');

  assertPaperworkKeyring();
  console.log('[Paperwork] Connecting to', ENV.MONGO_URI.replace(/\/\/[^@]*@/, '//***@'));
  await mongoose.connect(ENV.MONGO_URI);

  const report = await reencryptPaperwork({ dryRun });
  console.log(`[Paperwork] Active key: ${report.activeKeyId}`);
  console.log(`[Paperwork] Documents scanned: ${report.scanned}`);
  console.log('[Paperwork] Stored values per key:', JSON.stringify(report.valuesByKey));
  console.log(`[Paperwork] Documents on an old key: ${report.needingMigration}`);
  if (dryRun) {
    console.log(args.includes('--report') ? '[Paperwork] Report only; nothing changed.' : '[Paperwork] Dry run; nothing changed.');
  } else {
    console.log(`[Paperwork] Migrated: ${report.migrated}`);
  }
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('[Paperwork] Failed:', err?.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
