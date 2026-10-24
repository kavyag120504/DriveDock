/**
 * Prints a summary of seeded data — counts, status breakdowns, and demo logins.
 *
 * Called by: npm run seed:report
 * Also called at the end of index.ts.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { SEED_CONFIG } from './config';
import { SeedRegistry } from './models/SeedRegistry';
import { User }         from '../../src/models/User';
import { Provider }     from '../../src/models/Provider';
import { Vehicle }      from '../../src/models/Vehicle';
import { DocumentModel }from '../../src/models/Document';
import { Booking }      from '../../src/models/Booking';
import { Violation }    from '../../src/models/Violation';
import { Challan }      from '../../src/models/Challan';
import { Reminder }     from '../../src/models/Reminder';
import { RegionBaseline } from './models/RegionBaseline';

function line(char = '-', n = 70): string { return char.repeat(n); }

export async function printReport(): Promise<void> {
  // Collect seeded IDs per collection
  const entries = await SeedRegistry.find({}).lean();
  const byCol   = new Map<string, mongoose.Types.ObjectId[]>();
  for (const e of entries) {
    const list = byCol.get(e.collectionName) ?? [];
    list.push(e.docId as mongoose.Types.ObjectId);
    byCol.set(e.collectionName, list);
  }

  const seedUserIds     = byCol.get('users')     ?? [];
  const seedVehicleIds  = byCol.get('vehicles')   ?? [];
  const seedDocIds      = byCol.get('documents')  ?? [];
  const seedProviderIds = byCol.get('providers')  ?? [];

  console.log('\n' + line('='));
  console.log('DriveDock Seed Report');
  console.log(line('='));

  // ── Counts per collection ─────────────────────────────────────────────────
  console.log('\nCollection counts:');
  for (const [col, ids] of byCol.entries()) {
    console.log(`  ${col.padEnd(22)} ${ids.length}`);
  }

  // ── Document status breakdown ─────────────────────────────────────────────
  if (seedDocIds.length > 0) {
    const docs = await DocumentModel.find({ _id: { $in: seedDocIds } }, 'type status verified').lean();
    const byStatus: Record<string, number> = {};
    const byType:   Record<string, number> = {};
    let unverified = 0;
    for (const d of docs) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
      byType[d.type]     = (byType[d.type]     ?? 0) + 1;
      if (!d.verified) unverified++;
    }
    console.log('\nDocuments by status:');
    for (const [s, c] of Object.entries(byStatus)) console.log(`  ${s.padEnd(20)} ${c}`);
    console.log('\nDocuments by type:');
    for (const [t, c] of Object.entries(byType)) console.log(`  ${t.padEnd(20)} ${c}`);
    console.log(`\nUnverified (owner-uploaded): ${unverified}`);
  }

  // ── Providers by service type ─────────────────────────────────────────────
  if (seedProviderIds.length > 0) {
    const providers = await Provider.find({ _id: { $in: seedProviderIds } }, 'businessName serviceTypes status').lean();
    const byService: Record<string, number> = {};
    for (const p of providers) {
      for (const s of p.serviceTypes) byService[s] = (byService[s] ?? 0) + 1;
    }
    console.log('\nProviders by service type:');
    for (const [s, c] of Object.entries(byService)) console.log(`  ${s.padEnd(20)} ${c}`);
    console.log(`  Total approved:       ${providers.filter(p => p.status === 'approved').length}`);
  }

  // ── Vehicles by region ────────────────────────────────────────────────────
  if (seedVehicleIds.length > 0) {
    const vehicles = await Vehicle.find({ _id: { $in: seedVehicleIds } }, 'region fuelType').lean();
    const byDistrict: Record<string, number> = {};
    const byFuel:     Record<string, number> = {};
    for (const v of vehicles) {
      const d = v.region?.district ?? 'Unknown';
      byDistrict[d] = (byDistrict[d] ?? 0) + 1;
      byFuel[v.fuelType] = (byFuel[v.fuelType] ?? 0) + 1;
    }
    console.log('\nVehicles by district (top 10):');
    Object.entries(byDistrict)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([d, c]) => console.log(`  ${d.padEnd(28)} ${c}`));
    console.log('\nVehicles by fuel type:');
    for (const [f, c] of Object.entries(byFuel)) console.log(`  ${f.padEnd(20)} ${c}`);
  }

  // ── RegionBaseline summary ────────────────────────────────────────────────
  const baselineCount = await RegionBaseline.countDocuments({ state: SEED_CONFIG.SEED_STATE });
  if (baselineCount > 0) {
    console.log(`\nRegionBaseline records for ${SEED_CONFIG.SEED_STATE}: ${baselineCount}`);
  }

  // ── Demo login list ───────────────────────────────────────────────────────
  console.log('\n' + line('-'));
  console.log('Demo logins (all use password from SEED_DEMO_PASSWORD):');
  console.log(line('-'));

  const seedUsers = await User.find({ _id: { $in: seedUserIds } }, 'email role').lean();
  const grouped: Record<string, string[]> = {};
  for (const u of seedUsers) {
    const r = grouped[u.role] ?? [];
    r.push(u.email);
    grouped[u.role] = r;
  }

  const roleOrder = ['admin', 'government', 'officer', 'owner', 'provider'];
  for (const role of roleOrder) {
    const emails = grouped[role] ?? [];
    if (emails.length === 0) continue;
    console.log(`\n  ${role.toUpperCase()}:`);
    emails.slice(0, 5).forEach((e) => console.log(`    ${e}`));
    if (emails.length > 5) console.log(`    … and ${emails.length - 5} more`);
  }

  console.log('\n' + line('=') + '\n');
}

// ── Run standalone ────────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    console.log('[Report] Connecting to', SEED_CONFIG.MONGO_URI);
    await mongoose.connect(SEED_CONFIG.MONGO_URI);
    await printReport();
    await mongoose.disconnect();
  })().catch((err) => {
    console.error('[Report] Error:', err);
    process.exit(1);
  });
}
