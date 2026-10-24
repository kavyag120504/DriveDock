import crypto from 'crypto';
import mongoose from 'mongoose';
import { Vehicle, IVehicle } from '../../../src/models/Vehicle';
import { IUser } from '../../../src/models/User';
import { SEED_CONFIG, getRtosForState } from '../config';
import { SeededRng } from '../lib/rng';
import { registerMany } from '../lib/registry';

const MAKES_MODELS: Record<string, { make: string; models: string[] }[]> = {
  car: [
    { make: 'Maruti Suzuki', models: ['Swift', 'Dzire', 'Baleno', 'Alto', 'Brezza'] },
    { make: 'Hyundai',       models: ['i20', 'Creta', 'Verna', 'Grand i10', 'Venue'] },
    { make: 'Tata',          models: ['Nexon', 'Punch', 'Tiago', 'Altroz', 'Safari'] },
    { make: 'Honda',         models: ['City', 'Amaze', 'WR-V', 'Jazz', 'Elevate'] },
    { make: 'Kia',           models: ['Seltos', 'Sonet', 'Carens', 'EV6'] },
  ],
  bike: [
    { make: 'Hero',          models: ['Splendor', 'HF Deluxe', 'Glamour', 'Passion'] },
    { make: 'Honda',         models: ['Activa', 'Shine', 'Unicorn', 'SP 125'] },
    { make: 'Bajaj',         models: ['Pulsar 150', 'Pulsar NS', 'Avenger', 'CT100'] },
    { make: 'Royal Enfield', models: ['Classic 350', 'Meteor 350', 'Bullet 350', 'Hunter 350'] },
    { make: 'TVS',           models: ['Apache RTR', 'Jupiter', 'Ntorq', 'Raider'] },
  ],
};

export interface VehicleSeedResult {
  vehicles:    (IVehicle & { _id: mongoose.Types.ObjectId })[];
  vehicleIds:  mongoose.Types.ObjectId[];
}

export async function seedSyntheticVehicles(
  runId:   string,
  owners:  (IUser & { _id: mongoose.Types.ObjectId })[],
  vehicleCountPerRTO: Map<string, { district: string; count: number }>,
  rng:     SeededRng,
  dryRun:  boolean
): Promise<VehicleSeedResult> {
  const { SEED_STATE, SEED_VEHICLE_COUNT } = SEED_CONFIG;
  const rtoDefs = getRtosForState(SEED_STATE);

  // Build final RTO list with vehicle counts
  // Prefer VAHAN-derived map; fall back to uniform across known RTOs
  type RtoDef = { code: string; district: string; count: number };
  let rtoList: RtoDef[];

  if (vehicleCountPerRTO.size > 0) {
    // Try to match VAHAN RTO names to known RTO codes
    rtoList = [];
    let remaining = SEED_VEHICLE_COUNT;
    const entries = [...vehicleCountPerRTO.entries()];
    for (let i = 0; i < entries.length; i++) {
      const [rtoName, { district, count }] = entries[i];
      // Find a matching known RTO code (by district name similarity)
      const matched = rtoDefs.find(
        (r) => r.district.toLowerCase().includes(rtoName.toLowerCase().slice(0, 4)) ||
               rtoName.toLowerCase().includes(r.district.toLowerCase().slice(0, 4))
      );
      const code = matched?.code ?? rtoDefs[i % rtoDefs.length].code;
      const dist = matched?.district ?? district;
      const cnt  = i === entries.length - 1 ? remaining : Math.min(count, remaining);
      if (cnt <= 0) continue;
      rtoList.push({ code, district: dist, count: cnt });
      remaining -= cnt;
    }
    // If there's still a remainder, add to the first RTO
    if (remaining > 0 && rtoList.length > 0) rtoList[0].count += remaining;
  } else {
    const perRTO = Math.max(1, Math.floor(SEED_VEHICLE_COUNT / rtoDefs.length));
    let rem = SEED_VEHICLE_COUNT;
    rtoList = rtoDefs.map((r, i) => {
      const c = i === rtoDefs.length - 1 ? rem : perRTO;
      rem -= c;
      return { ...r, count: Math.max(1, c) };
    });
  }

  if (dryRun) {
    const total = rtoList.reduce((s, r) => s + r.count, 0);
    console.log(`[DRY-RUN] Would create ${total} vehicles across ${rtoList.length} RTOs`);
    for (const r of rtoList) console.log(`  ${r.code} (${r.district}): ${r.count} vehicles`);
    return { vehicles: [], vehicleIds: [] };
  }

  const vehicles: (IVehicle & { _id: mongoose.Types.ObjectId })[] = [];
  const vehicleIds: mongoose.Types.ObjectId[] = [];
  const serialMap = new Map<string, number>(); // rto_code → serial counter
  const fuelTypes: Array<'petrol' | 'diesel' | 'ev'> = ['petrol', 'petrol', 'petrol', 'diesel', 'diesel', 'ev'];
  const types: Array<'car' | 'bike'> = ['car', 'car', 'car', 'bike', 'bike'];
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

  for (const rto of rtoList) {
    if (!serialMap.has(rto.code)) serialMap.set(rto.code, 1);

    for (let i = 0; i < rto.count; i++) {
      const serial = serialMap.get(rto.code)!;
      serialMap.set(rto.code, serial + 1);

      const regNumber = `${rto.code}ZZ${String(serial).padStart(4, '0')}`;
      const fuelType  = rng.pick(fuelTypes);
      const type      = rng.pick(types);
      const year      = rng.pick(years);
      const owner     = rng.pick(owners);

      const mmEntry = rng.pick(MAKES_MODELS[type]);
      const make    = mmEntry.make;
      const model   = rng.pick(mmEntry.models);
      const qrCodeId = `DD-SEED-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

      const vehicle = await Vehicle.create({
        ownerId:   owner._id,
        regNumber,
        type,
        fuelType,
        make,
        model,
        year,
        qrCodeId,
        region: { state: SEED_STATE, district: rto.district },
      });

      vehicles.push(vehicle as IVehicle & { _id: mongoose.Types.ObjectId });
      vehicleIds.push(vehicle._id as mongoose.Types.ObjectId);
    }
  }

  await registerMany(runId, 'vehicles', vehicleIds);
  console.log(`[Vehicles] Created ${vehicleIds.length} vehicles across ${rtoList.length} RTOs`);
  return { vehicles, vehicleIds };
}
