import mongoose from 'mongoose';
import { Violation } from '../../../src/models/Violation';
import { Challan } from '../../../src/models/Challan';
import { IVehicle } from '../../../src/models/Vehicle';
import { IUser } from '../../../src/models/User';
import { SeededRng } from '../lib/rng';
import { registerMany } from '../lib/registry';

const LOCATIONS = [
  'Main Traffic Junction, City Centre',
  'Highway Toll Check, National Highway',
  'Railway Station Road Checkpoint',
  'Bus Stand Intersection',
  'Market Area Traffic Point',
  'Airport Road Checkpoint',
];

const PENALTY_MAP: Record<string, number> = {
  puc:      1000,
  insurance: 2000,
  rc:       500,
  license:  500,
  fitness:  1000,
};

export interface ViolationChallanResult {
  violationIds: mongoose.Types.ObjectId[];
  challanIds:   mongoose.Types.ObjectId[];
}

export async function seedViolationsAndChallans(
  runId:             string,
  vehicles:          (IVehicle & { _id: mongoose.Types.ObjectId })[],
  officer:           IUser & { _id: mongoose.Types.ObjectId },
  expiredVehicleIds: Set<string>,
  rng:               SeededRng,
  dryRun:            boolean
): Promise<ViolationChallanResult> {

  const eligibleVehicles = vehicles.filter((v) => expiredVehicleIds.has(v._id.toString()));

  if (dryRun) {
    console.log(`[DRY-RUN] Would create 6 violations on ${eligibleVehicles.length} expired vehicles + 8 challans`);
    return { violationIds: [], challanIds: [] };
  }

  const violationIds: mongoose.Types.ObjectId[] = [];
  const challanIds:   mongoose.Types.ObjectId[] = [];

  const violationTargets = rng.shuffle(eligibleVehicles).slice(0, Math.min(6, eligibleVehicles.length));

  for (const vehicle of violationTargets) {
    const expiredTypes = vehicle.fuelType === 'ev'
      ? rng.pick([['insurance'], ['rc'], ['insurance', 'rc']])
      : rng.pick([['puc'], ['insurance'], ['puc', 'insurance'], ['rc'], ['puc', 'rc']]);

    const penalty = expiredTypes.reduce((sum, t) => sum + (PENALTY_MAP[t] ?? 1000), 0);

    const challan = await Challan.create({
      vehicleId: vehicle._id,
      amount:    penalty,
      reason:    `Non-compliance: ${expiredTypes.join(', ')} document(s) expired or unverified`,
      status:    rng.bool(0.4) ? 'paid' : 'pending',
      issuedAt:  new Date(Date.now() - rng.nextInt(1, 30) * 86400000),
    });
    challanIds.push(challan._id as mongoose.Types.ObjectId);

    const violation = await Violation.create({
      vehicleId:           vehicle._id,
      officerId:           officer._id,
      documentTypeExpired: expiredTypes,
      location:            rng.pick(LOCATIONS),
      notes:               `Vehicle stopped at checkpoint. ${expiredTypes.join(', ')} not in order.`,
      challanId:           challan._id,
    });
    violationIds.push(violation._id as mongoose.Types.ObjectId);
  }

  // Add 2 extra challans (no linked violation) for variety
  for (let i = 0; i < 2; i++) {
    const vehicle = rng.pick(vehicles);
    const challan = await Challan.create({
      vehicleId: vehicle._id,
      amount:    rng.pick([500, 1000, 2000]),
      reason:    rng.pick(['Over-speeding', 'Wrong lane', 'No helmet (bike)', 'Parking violation']),
      status:    rng.bool(0.5) ? 'paid' : 'pending',
      issuedAt:  new Date(Date.now() - rng.nextInt(1, 60) * 86400000),
    });
    challanIds.push(challan._id as mongoose.Types.ObjectId);
  }

  await registerMany(runId, 'violations', violationIds);
  await registerMany(runId, 'challans',   challanIds);

  console.log(`[Violations] Created ${violationIds.length} violations, ${challanIds.length} challans`);
  return { violationIds, challanIds };
}
