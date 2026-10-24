/**
 * Optionally seeds a Vehicle Twin demo vehicle with a prior-ownership transfer.
 * Silently skips if OwnershipTransfer model can't be imported (forward-compat).
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Vehicle } from '../../../src/models/Vehicle';
import { DocumentModel } from '../../../src/models/Document';
import { Booking } from '../../../src/models/Booking';
import { Slot } from '../../../src/models/Slot';
import { Violation } from '../../../src/models/Violation';
import { OwnershipTransfer } from '../../../src/models/OwnershipTransfer';
import { User, IUser } from '../../../src/models/User';
import { computeSnapshotHash, computeHash } from '../../../src/services/transfer.service';
import { SEED_CONFIG } from '../config';
import { SeededRng } from '../lib/rng';
import { registerMany } from '../lib/registry';

const TWIN_REG = 'SEED01ZZ0099'; // clearly fake, within the ZZ series

export async function seedTwinTransfer(
  runId:   string,
  owners:  (IUser & { _id: mongoose.Types.ObjectId })[],
  providerIds: mongoose.Types.ObjectId[],
  rng:     SeededRng,
  dryRun:  boolean
): Promise<void> {

  if (dryRun) {
    console.log('[DRY-RUN] Would create 1 twin-demo vehicle with prior ownership transfer');
    return;
  }

  if (owners.length < 2) {
    console.log('[Twin] Not enough owners to create a transfer demo; skipping.');
    return;
  }

  const { SEED_STATE, SEED_DEMO_PASSWORD } = SEED_CONFIG;

  // Remove any leftover twin-demo vehicle from a previous seed run
  const existing = await Vehicle.findOne({ regNumber: TWIN_REG });
  if (existing) {
    const vid = existing._id;
    await Promise.all([
      DocumentModel.deleteMany({ vehicleId: vid }),
      Booking.deleteMany({ vehicleId: vid }),
      Slot.find({ _id: { $in: [] } }), // no-op placeholder
      Violation.deleteMany({ vehicleId: vid }),
      OwnershipTransfer.deleteMany({ vehicleId: vid }),
      Vehicle.deleteOne({ _id: vid }),
    ]);
  }

  // Previous owner: a dedicated demo account
  let prevOwner = await User.findOne({ email: 'prev.owner@demo.drivedock.test' });
  if (!prevOwner) {
    prevOwner = await User.create({
      name:         'Previous Owner Demo',
      email:        'prev.owner@demo.drivedock.test',
      phone:        '700000' + '0099',
      passwordHash: await bcrypt.hash(SEED_DEMO_PASSWORD, 10),
      role:         'owner',
      address:      { city: SEED_CONFIG.SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
    });
    await registerMany(runId, 'users', [prevOwner._id as mongoose.Types.ObjectId]);
  }

  const currentOwner = rng.pick(owners);

  const vehicle = await Vehicle.create({
    ownerId:   currentOwner._id,
    regNumber: TWIN_REG,
    type:      'car',
    fuelType:  'petrol',
    make:      'Maruti Suzuki',
    model:     'Swift',
    year:      2019,
    qrCodeId:  `DD-TWIN-SEED-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    region:    { state: SEED_STATE, district: SEED_CONFIG.SEED_AREA_NAME },
  });

  const now       = new Date();
  const issueDate = new Date(now.getTime() - 180 * 86400000);
  const expiry    = new Date(now.getTime() + 180 * 86400000);
  const pId       = providerIds.length > 0 ? rng.pick(providerIds) : undefined;

  const docs = await DocumentModel.insertMany([
    {
      vehicleId:         vehicle._id,
      type:              'rc',
      fileUrl:           '/seed-samples/twin_rc.png',
      fileHash:          crypto.createHash('sha256').update('seed-twin-rc').digest('hex'),
      issueDate,
      expiryDate:        new Date(now.getTime() + 10 * 365 * 86400000),
      status:            'valid',
      lastUpdatedBy:     'provider',
      verified:          true,
      issuedByProviderId: pId ?? null,
    },
    {
      vehicleId:         vehicle._id,
      type:              'insurance',
      fileUrl:           '/seed-samples/twin_insurance.png',
      fileHash:          crypto.createHash('sha256').update('seed-twin-insurance').digest('hex'),
      issueDate,
      expiryDate:        expiry,
      status:            'valid',
      lastUpdatedBy:     'provider',
      verified:          true,
      issuedByProviderId: pId ?? null,
    },
    {
      vehicleId:         vehicle._id,
      type:              'puc',
      fileUrl:           '/seed-samples/twin_puc.png',
      fileHash:          crypto.createHash('sha256').update('seed-twin-puc').digest('hex'),
      issueDate,
      expiryDate:        new Date(now.getTime() + 90 * 86400000),
      status:            'valid',
      lastUpdatedBy:     'provider',
      verified:          true,
      issuedByProviderId: pId ?? null,
    },
  ]);

  // One past violation
  const violation = await Violation.create({
    vehicleId:           vehicle._id,
    officerId:           currentOwner._id,
    documentTypeExpired: ['puc'],
    location:            'Demo Checkpoint',
    notes:               'PUC expired at time of transfer (demo)',
  });

  // One completed booking
  const slotDate = new Date(now.getTime() - 60 * 86400000);
  const slot = await Slot.create({
    providerId: pId ?? new mongoose.Types.ObjectId(),
    date:       slotDate.toISOString().split('T')[0],
    startTime:  '10:00 AM',
    endTime:    '11:00 AM',
    isBooked:   true,
  });
  const booking = await Booking.create({
    ownerId:        currentOwner._id,
    vehicleId:      vehicle._id,
    providerId:     pId ?? new mongoose.Types.ObjectId(),
    slotId:         slot._id,
    documentType:   'rc',
    status:         'completed',
    certificateUrl: '/seed-samples/twin_cert_rc.pdf',
  });

  // One accepted prior ownership transfer
  const acceptedAt = new Date(now.getTime() - 365 * 86400000);
  const snapshot   = {
    score: 62,
    verifiedDocTypes:      ['rc'],
    completedServiceCount: 1,
    violationCount:        1,
    ownershipIndex:        1,
  };
  const snapshotHash = computeSnapshotHash(snapshot);
  const prevHash     = 'GENESIS';
  const hash         = computeHash(
    prevHash,
    vehicle._id.toString(),
    prevOwner._id.toString(),
    currentOwner._id.toString(),
    acceptedAt,
    snapshotHash
  );

  const transfer = await OwnershipTransfer.create({
    vehicleId:   vehicle._id,
    fromOwnerId: prevOwner._id,
    toOwnerId:   currentOwner._id,
    status:      'accepted',
    expiresAt:   new Date(acceptedAt.getTime() + 10 * 60 * 1000),
    snapshot,
    snapshotHash,
    prevHash,
    hash,
    acceptedAt,
  });

  const ids = [
    vehicle._id as mongoose.Types.ObjectId,
    ...docs.map((d) => d._id as mongoose.Types.ObjectId),
    violation._id as mongoose.Types.ObjectId,
    slot._id as mongoose.Types.ObjectId,
    booking._id as mongoose.Types.ObjectId,
    transfer._id as mongoose.Types.ObjectId,
  ];
  await Promise.all([
    registerMany(runId, 'vehicles',           [vehicle._id as mongoose.Types.ObjectId]),
    registerMany(runId, 'documents',          docs.map((d) => d._id as mongoose.Types.ObjectId)),
    registerMany(runId, 'violations',         [violation._id as mongoose.Types.ObjectId]),
    registerMany(runId, 'slots',              [slot._id as mongoose.Types.ObjectId]),
    registerMany(runId, 'bookings',           [booking._id as mongoose.Types.ObjectId]),
    registerMany(runId, 'ownershiptransfers', [transfer._id as mongoose.Types.ObjectId]),
  ]);

  console.log(`[Twin] Created demo vehicle ${TWIN_REG} with prior ownership transfer`);
  console.log(`  Login as owner (${currentOwner.email}) to see Vehicle Twin score and history`);
}
