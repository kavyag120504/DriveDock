/**
 * DriveDock demo seed toolkit — main entry point.
 *
 * npm run seed              — idempotent; clears any previous run first
 * npm run seed -- --dry-run — prints counts, writes nothing to the DB
 *
 * NEVER runs in production (NODE_ENV === "production" → exits immediately).
 */
import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { SEED_CONFIG } from './config';
import { SeededRng }   from './lib/rng';
import { SeedRegistry } from './models/SeedRegistry';

import { seedOsmProviders, seedManualProviders } from './steps/01-osm-providers';
import { seedVahanBaselines }                     from './steps/02-vahan-baselines';
import { seedSyntheticUsers }                     from './steps/03-synthetic-users';
import { seedSyntheticVehicles }                  from './steps/04-synthetic-vehicles';
import { seedSyntheticDocuments }                 from './steps/05-synthetic-documents';
import { seedSlotsAndBookings }                   from './steps/06-slots-bookings';
import { seedViolationsAndChallans }              from './steps/07-violations-challans';
import { seedReminders }                          from './steps/08-reminders';
import { seedTwinTransfer }                       from './steps/09-twin-transfer';
import { clearSeedData }                          from './clear';
import { printReport }                            from './report';

const DRY_RUN = process.argv.includes('--dry-run');

async function run(): Promise<void> {
  // ── Production guard ──────────────────────────────────────────────────────
  if (SEED_CONFIG.NODE_ENV === 'production') {
    console.error('[Seed] REFUSED: NODE_ENV === "production". This script must never run on production data.');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`DriveDock Demo Seed  ${DRY_RUN ? '(DRY-RUN — no writes)' : ''}`);
  console.log(`State: ${SEED_CONFIG.SEED_STATE}  |  Area: ${SEED_CONFIG.SEED_AREA_NAME}`);
  console.log(`Providers: ${SEED_CONFIG.SEED_PROVIDER_COUNT}  |  Vehicles: ${SEED_CONFIG.SEED_VEHICLE_COUNT}`);
  console.log(`${'='.repeat(70)}\n`);

  console.log('[DB] Connecting to', SEED_CONFIG.MONGO_URI);
  await mongoose.connect(SEED_CONFIG.MONGO_URI);
  console.log('[DB] Connected');

  // ── Idempotency: clear any previous seed run ──────────────────────────────
  const existingCount = await SeedRegistry.countDocuments();
  if (existingCount > 0) {
    console.log(`[Seed] Found ${existingCount} records from a previous run. Clearing first…`);
    if (!DRY_RUN) {
      await clearSeedData(false /* not verbose */);
      console.log('[Seed] Previous run cleared.');
    } else {
      console.log('[DRY-RUN] Would clear previous run first.');
    }
  }

  const runId = `seed_${Date.now()}`;
  const rng   = new SeededRng(SEED_CONFIG.SEED_RANDOM);

  // ── Step 1: OSM providers ─────────────────────────────────────────────────
  console.log('\n[1/9] OSM providers…');
  const osmResult = await seedOsmProviders(runId, rng, DRY_RUN);
  const manualResult = await seedManualProviders(runId, rng, osmResult.providerCount, DRY_RUN);
  const allProviderIds = [...osmResult.providerIds, ...manualResult.providerIds];

  // ── Step 2: VAHAN baselines ───────────────────────────────────────────────
  console.log('\n[2/9] VAHAN baselines…');
  const { vehicleCountPerRTO } = await seedVahanBaselines(runId, DRY_RUN);

  // ── Step 3: Synthetic users ───────────────────────────────────────────────
  console.log('\n[3/9] Synthetic users…');
  const { owners, officer } = await seedSyntheticUsers(runId, DRY_RUN);

  // ── Step 4: Synthetic vehicles ────────────────────────────────────────────
  console.log('\n[4/9] Synthetic vehicles…');
  const { vehicles } = await seedSyntheticVehicles(runId, owners, vehicleCountPerRTO, rng, DRY_RUN);

  // ── Step 5: Documents ─────────────────────────────────────────────────────
  console.log('\n[5/9] Synthetic documents (generating SAMPLE images)…');
  const { expiredVehicleIds, expiringSoonDocInfo } = await seedSyntheticDocuments(
    runId, vehicles, owners, allProviderIds, rng, DRY_RUN
  );

  // ── Step 6: Slots & bookings ──────────────────────────────────────────────
  console.log('\n[6/9] Slots and bookings…');
  await seedSlotsAndBookings(runId, allProviderIds, vehicles, owners, rng, DRY_RUN);

  // ── Step 7: Violations & challans ─────────────────────────────────────────
  console.log('\n[7/9] Violations and challans…');
  await seedViolationsAndChallans(runId, vehicles, officer, expiredVehicleIds, rng, DRY_RUN);

  // ── Step 8: Reminders ─────────────────────────────────────────────────────
  console.log('\n[8/9] Reminders…');
  await seedReminders(runId, expiringSoonDocInfo, DRY_RUN);

  // ── Step 9: Vehicle Twin ──────────────────────────────────────────────────
  console.log('\n[9/9] Vehicle Twin demo…');
  await seedTwinTransfer(runId, owners, allProviderIds, rng, DRY_RUN);

  // ── Report ────────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n');
    await printReport();
  }

  await mongoose.disconnect();
  console.log('\n[Seed] Done.\n');
}

run().catch((err) => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
