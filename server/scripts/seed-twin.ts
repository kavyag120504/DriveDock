/**
 * Vehicle Twin demo seed.
 * Run AFTER `npm run seed` (which creates users and the approved provider).
 *
 * Creates:
 *   - Vehicle DL9CC7890 owned by owner@drivedock.com
 *   - 2 verified documents (RC + insurance)
 *   - 2 completed bookings
 *   - 1 old violation
 *   - 1 accepted prior-ownership transfer (prev.owner → current owner)
 *
 * Demonstrates: score, timeline, QR transfer, buyer preview, share link.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { DocumentModel } from '../src/models/Document';
import { Provider } from '../src/models/Provider';
import { Slot } from '../src/models/Slot';
import { Booking } from '../src/models/Booking';
import { Violation } from '../src/models/Violation';
import { OwnershipTransfer } from '../src/models/OwnershipTransfer';
import {
  computeSnapshotHash,
  computeHash
} from '../src/services/transfer.service';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/drivedock';
const REG       = 'DL9CC7890';

const run = async () => {
  console.log('[seed-twin] Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  // ── Find the demo owner ───────────────────────────────────────────────────
  const currentOwner = await User.findOne({ email: 'owner@drivedock.com' });
  if (!currentOwner) {
    console.error('[seed-twin] owner@drivedock.com not found. Run `npm run seed` first.');
    process.exit(1);
  }

  // ── Find the approved provider ────────────────────────────────────────────
  const provider = await Provider.findOne({ status: 'approved' });
  if (!provider) {
    console.error('[seed-twin] No approved provider found. Run `npm run seed` first.');
    process.exit(1);
  }

  // ── Remove any leftover twin-demo data ────────────────────────────────────
  const existing = await Vehicle.findOne({ regNumber: REG });
  if (existing) {
    const vid = existing._id;
    await Promise.all([
      DocumentModel.deleteMany({ vehicleId: vid }),
      Booking.deleteMany({ vehicleId: vid }),
      Violation.deleteMany({ vehicleId: vid }),
      OwnershipTransfer.deleteMany({ vehicleId: vid }),
      Vehicle.deleteOne({ _id: vid })
    ]);
  }

  // ── Create / ensure previous owner exists ────────────────────────────────
  let prevOwner = await User.findOne({ email: 'prev.owner@drivedock.demo' });
  if (!prevOwner) {
    prevOwner = await User.create({
      name: 'Previous Owner (Twin Demo)',
      email: 'prev.owner@drivedock.demo',
      phone: '+919700000099',
      passwordHash: await bcrypt.hash('password123', 10),
      role: 'owner',
      address: { city: 'Delhi', state: 'Delhi', pincode: '110001' }
    });
  }

  // ── Create vehicle ────────────────────────────────────────────────────────
  const vehicle = await Vehicle.create({
    ownerId:  currentOwner._id,
    regNumber: REG,
    type: 'car',
    fuelType: 'petrol',
    make: 'Maruti Suzuki',
    model: 'Swift',
    year: 2019,
    qrCodeId: `DD-TWIN${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    region: { state: 'Delhi', district: 'South Delhi' }
  });
  console.log('[seed-twin] Vehicle created:', REG);

  // ── Two verified documents ────────────────────────────────────────────────
  const now = new Date();
  const issueDate  = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); // 6 months ago
  const expiryDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 6 months ahead

  await DocumentModel.create([
    {
      vehicleId: vehicle._id,
      type: 'rc',
      fileUrl: '/uploads/twin-demo-rc.pdf',
      fileHash: crypto.createHash('sha256').update('rc-demo').digest('hex'),
      issueDate,
      expiryDate: new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000),
      status: 'valid',
      lastUpdatedBy: 'provider',
      verified: true,
      issuedByProviderId: provider._id
    },
    {
      vehicleId: vehicle._id,
      type: 'insurance',
      fileUrl: '/uploads/twin-demo-insurance.pdf',
      fileHash: crypto.createHash('sha256').update('insurance-demo').digest('hex'),
      issueDate,
      expiryDate,
      status: 'valid',
      lastUpdatedBy: 'provider',
      verified: true,
      issuedByProviderId: provider._id
    }
  ]);
  console.log('[seed-twin] 2 verified documents created');

  // ── Two completed bookings ────────────────────────────────────────────────
  const slotBase = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 2 months ago

  for (let i = 0; i < 2; i++) {
    const slotDate = new Date(slotBase.getTime() + i * 30 * 24 * 60 * 60 * 1000);
    const slot = await Slot.create({
      providerId: provider._id,
      date: slotDate,
      startTime: '10:00',
      endTime: '11:00',
      isBooked: true
    });
    await Booking.create({
      ownerId:      currentOwner._id,
      vehicleId:    vehicle._id,
      providerId:   provider._id,
      slotId:       slot._id,
      documentType: i === 0 ? 'rc' : 'insurance',
      status:       'completed',
      certificateUrl: `/uploads/twin-cert-${i}.pdf`
    });
  }
  console.log('[seed-twin] 2 completed bookings created');

  // ── One old violation ─────────────────────────────────────────────────────
  await Violation.create({
    vehicleId:            vehicle._id,
    officerId:            currentOwner._id,
    documentTypeExpired:  ['puc'],
    location:             'MG Road, Delhi',
    notes:                'PUC certificate expired'
  });
  console.log('[seed-twin] 1 violation created');

  // ── One accepted prior ownership transfer ─────────────────────────────────
  const acceptedAt = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago

  const snapshot = {
    score: 62,
    verifiedDocTypes: ['rc'],
    completedServiceCount: 1,
    violationCount: 1,
    ownershipIndex: 1
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

  await OwnershipTransfer.create({
    vehicleId:   vehicle._id,
    fromOwnerId: prevOwner._id,
    toOwnerId:   currentOwner._id,
    status:      'accepted',
    expiresAt:   new Date(acceptedAt.getTime() + 10 * 60 * 1000),
    snapshot,
    snapshotHash,
    prevHash,
    hash,
    acceptedAt
  });
  console.log('[seed-twin] Prior ownership transfer seeded (Owner 1 → You)');

  console.log('');
  console.log('===================================================');
  console.log('[seed-twin] Complete. Demo vehicle:');
  console.log('  Registration : DL9CC7890');
  console.log('  Login as     : owner@drivedock.com / password123');
  console.log('  Features     : Vehicle Twin → score, timeline,');
  console.log('                 Transfer Ownership QR, Share link');
  console.log('===================================================');

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('[seed-twin] Error:', err);
  process.exit(1);
});
