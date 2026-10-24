import mongoose from 'mongoose';
import { Slot } from '../../../src/models/Slot';
import { Booking } from '../../../src/models/Booking';
import { Payment } from '../../../src/models/Payment';
import { IVehicle } from '../../../src/models/Vehicle';
import { IUser } from '../../../src/models/User';
import { SeededRng } from '../lib/rng';
import { registerMany } from '../lib/registry';

// Service fees (mirror paymentService.ts SERVICE_FEES_INR)
const SERVICE_FEES: Record<string, number> = {
  puc:      250,
  insurance: 2400,
  rc:       1000,
  license:  1000,
  fitness:  1000,
};

const SLOT_TIMES = [
  { start: '09:00 AM', end: '10:00 AM' },
  { start: '10:30 AM', end: '11:30 AM' },
  { start: '01:00 PM', end: '02:00 PM' },
  { start: '03:30 PM', end: '04:30 PM' },
];

function dateStr(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().split('T')[0];
}

export interface SlotBookingResult {
  slotIds:    mongoose.Types.ObjectId[];
  bookingIds: mongoose.Types.ObjectId[];
  paymentIds: mongoose.Types.ObjectId[];
}

export async function seedSlotsAndBookings(
  runId:       string,
  providerIds: mongoose.Types.ObjectId[],
  vehicles:    (IVehicle & { _id: mongoose.Types.ObjectId })[],
  owners:      (IUser & { _id: mongoose.Types.ObjectId })[],
  rng:         SeededRng,
  dryRun:      boolean
): Promise<SlotBookingResult> {

  if (providerIds.length === 0) {
    console.log('[Slots] No providers seeded; skipping slots/bookings.');
    return { slotIds: [], bookingIds: [], paymentIds: [] };
  }

  const totalSlots = providerIds.length * 14 * 4;
  if (dryRun) {
    console.log(`[DRY-RUN] Would create ${totalSlots} slots + 15 completed bookings`);
    return { slotIds: [], bookingIds: [], paymentIds: [] };
  }

  const slotIds:    mongoose.Types.ObjectId[] = [];
  const bookingIds: mongoose.Types.ObjectId[] = [];
  const paymentIds: mongoose.Types.ObjectId[] = [];

  // ── Future slots (next 14 days, 4 per provider per day) ──────────────────
  const slotDocuments: { providerId: mongoose.Types.ObjectId; date: string; startTime: string; endTime: string; isBooked: boolean }[] = [];

  for (const pid of providerIds) {
    for (let day = 0; day < 14; day++) {
      const date = dateStr(day);
      for (const time of SLOT_TIMES) {
        slotDocuments.push({
          providerId: pid,
          date,
          startTime:  time.start,
          endTime:    time.end,
          isBooked:   rng.bool(0.20), // ~20% pre-booked
        });
      }
    }
  }

  const insertedSlots = await Slot.insertMany(slotDocuments);
  insertedSlots.forEach((s) => slotIds.push(s._id as mongoose.Types.ObjectId));
  await registerMany(runId, 'slots', slotIds);

  // ── 15 completed bookings (demonstrating booking history) ─────────────────
  const docTypes: Array<'puc' | 'insurance' | 'rc'> = ['puc', 'puc', 'puc', 'insurance', 'insurance', 'rc', 'puc', 'insurance', 'puc', 'rc', 'insurance', 'puc', 'insurance', 'puc', 'rc'];

  for (let i = 0; i < 15; i++) {
    const vehicle     = rng.pick(vehicles);
    const owner       = owners.find((o) => o._id.toString() === vehicle.ownerId.toString()) ?? rng.pick(owners);
    const providerId  = rng.pick(providerIds);
    const documentType = vehicle.fuelType === 'ev' && docTypes[i] === 'puc' ? 'rc' : docTypes[i];

    // Past slot (1-90 days ago)
    const pastDate = dateStr(-rng.nextInt(1, 90));
    const time     = rng.pick(SLOT_TIMES);
    const slot = await Slot.create({
      providerId,
      date:      pastDate,
      startTime: time.start,
      endTime:   time.end,
      isBooked:  true,
    });
    slotIds.push(slot._id as mongoose.Types.ObjectId);
    await registerMany(runId, 'slots', [slot._id as mongoose.Types.ObjectId]);

    const amount = SERVICE_FEES[documentType] ?? 1000;
    const payment = await Payment.create({
      bookingId:          new mongoose.Types.ObjectId(), // placeholder, updated below
      amount,
      currency:           'INR',
      razorpayOrderId:    `demo_order_${Date.now()}_${i}`,
      razorpayPaymentId:  `demo_pay_${Date.now()}_${i}`,
      razorpaySignature:  `demo_sig_${i}`,
      status:             'paid',
    });
    paymentIds.push(payment._id as mongoose.Types.ObjectId);

    const booking = await Booking.create({
      ownerId:        owner._id,
      vehicleId:      vehicle._id,
      providerId,
      slotId:         slot._id,
      documentType,
      status:         'completed',
      paymentId:      payment._id,
      certificateUrl: `/seed-samples/cert_${vehicle.regNumber}_${documentType}_${i}.pdf`,
      notes:          'Seeded completed booking',
    });
    bookingIds.push(booking._id as mongoose.Types.ObjectId);

    // Back-fill bookingId in payment
    await Payment.findByIdAndUpdate(payment._id, { bookingId: booking._id });
  }

  await registerMany(runId, 'bookings', bookingIds);
  await registerMany(runId, 'payments', paymentIds);

  console.log(`[Slots] Created ${slotIds.length} slots, 15 completed bookings, 15 payments`);
  return { slotIds, bookingIds, paymentIds };
}
