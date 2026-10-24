/**
 * Deletes ONLY the records inserted by a previous seed run.
 * Uses seedRegistry entries; never does a broad deleteMany on any collection.
 *
 * Called by: npm run seed:clear
 * Also called internally by index.ts before a fresh seed.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { SEED_CONFIG } from './config';
import { SeedRegistry } from './models/SeedRegistry';

// Map collection name → Mongoose model (lazy, to avoid circular imports at top level)
function modelForCollection(name: string): mongoose.Model<any> | null {
  const map: Record<string, () => mongoose.Model<any>> = {
    users:              () => require('../../src/models/User').User,
    vehicles:           () => require('../../src/models/Vehicle').Vehicle,
    documents:          () => require('../../src/models/Document').DocumentModel,
    providers:          () => require('../../src/models/Provider').Provider,
    slots:              () => require('../../src/models/Slot').Slot,
    bookings:           () => require('../../src/models/Booking').Booking,
    payments:           () => require('../../src/models/Payment').Payment,
    reminders:          () => require('../../src/models/Reminder').Reminder,
    violations:         () => require('../../src/models/Violation').Violation,
    challans:           () => require('../../src/models/Challan').Challan,
    regionbaselines:    () => require('./models/RegionBaseline').RegionBaseline,
    ownershiptransfers: () => require('../../src/models/OwnershipTransfer').OwnershipTransfer,
  };
  const factory = map[name.toLowerCase()];
  return factory ? factory() : null;
}

export async function clearSeedData(verbose = true): Promise<void> {
  const entries = await SeedRegistry.find({}).lean();
  if (entries.length === 0) {
    if (verbose) console.log('[Clear] No seed data found in registry.');
    return;
  }

  // Group by collection
  const byCollection = new Map<string, mongoose.Types.ObjectId[]>();
  for (const e of entries) {
    const key  = e.collectionName.toLowerCase();
    const list = byCollection.get(key) ?? [];
    list.push(e.docId as mongoose.Types.ObjectId);
    byCollection.set(key, list);
  }

  let totalDeleted = 0;
  for (const [collection, ids] of byCollection.entries()) {
    const model = modelForCollection(collection);
    if (!model) {
      if (verbose) console.warn(`[Clear] Unknown collection "${collection}" — skipping`);
      continue;
    }
    const result = await model.deleteMany({ _id: { $in: ids } });
    if (verbose) console.log(`[Clear] ${collection}: deleted ${result.deletedCount} / ${ids.length}`);
    totalDeleted += result.deletedCount ?? 0;
  }

  await SeedRegistry.deleteMany({});
  if (verbose) console.log(`[Clear] Done. Removed ${totalDeleted} documents total, registry cleared.`);
}

// ── Run standalone when invoked directly ──────────────────────────────────────
if (require.main === module) {
  if (SEED_CONFIG.NODE_ENV === 'production') {
    console.error('[Clear] REFUSED: NODE_ENV === "production".');
    process.exit(1);
  }

  (async () => {
    console.log('[Clear] Connecting to', SEED_CONFIG.MONGO_URI);
    await mongoose.connect(SEED_CONFIG.MONGO_URI);
    await clearSeedData(true);
    await mongoose.disconnect();
  })().catch((err) => {
    console.error('[Clear] Error:', err);
    process.exit(1);
  });
}
