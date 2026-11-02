import { Types } from 'mongoose';
import { User } from '../models/User';
import { Provider } from '../models/Provider';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { Reminder } from '../models/Reminder';
import { Challan } from '../models/Challan';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { TwinShare } from '../models/TwinShare';
import { RefreshToken } from '../models/RefreshToken';
import { purgePaperworkFor } from './transferPaperwork.service';

/**
 * DPDP "export my data": assemble a machine-readable copy of everything the caller
 * personally owns. Read-only; returns the user's own records only (never other
 * people's PII). The password hash is never included.
 */
export const exportUserData = async (userId: string, role: string): Promise<Record<string, unknown>> => {
  const uid = new Types.ObjectId(userId);

  const [user, provider] = await Promise.all([
    User.findById(uid).select('-passwordHash').lean(),
    role === 'provider' ? Provider.findOne({ userId: uid }).lean() : Promise.resolve(null)
  ]);

  const vehicles = await Vehicle.find({ ownerId: uid }).lean();
  const vehicleIds = vehicles.map((v) => v._id);

  const [documents, ownerBookings, reminders, challans, transfers, shares] = await Promise.all([
    DocumentModel.find({ vehicleId: { $in: vehicleIds } }).lean(),
    Booking.find({ ownerId: uid }).lean(),
    Reminder.find({ ownerId: uid }).lean(),
    Challan.find({ vehicleId: { $in: vehicleIds } }).lean(),
    OwnershipTransfer.find({ $or: [{ fromOwnerId: uid }, { toOwnerId: uid }] }).lean(),
    TwinShare.find({ createdBy: uid }).lean()
  ]);

  // Payments for the caller's own bookings; plus, for a provider, the bookings assigned to them.
  const bookingIds = ownerBookings.map((b) => b._id);
  const [payments, providerBookings] = await Promise.all([
    Payment.find({ bookingId: { $in: bookingIds } }).lean(),
    provider ? Booking.find({ providerId: provider._id }).lean() : Promise.resolve([])
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    provider,
    vehicles,
    documents,
    bookings: ownerBookings,
    providerBookings,
    payments,
    reminders,
    challans,
    transfers,
    shares
  };
};

export interface DeleteResult {
  deleted: boolean;
  /** When deleted:false, why the account can't be closed yet. */
  reason?: 'owns_vehicles';
  vehicleCount?: number;
}

/**
 * DPDP "right to erasure" for OWNER accounts (right of erasure). It REFUSES while the
 * owner still has vehicles, because a vehicle may carry enforcement records (challans/
 * violations) that must survive — deleting a vehicle is already gated by that rule
 * (Trust Rule 8). The owner must delete or transfer each vehicle first. Accepted-
 * transfer ledger rows (Trust Rule 11) are never touched. Once the owner holds no
 * vehicles, their remaining personal data is removed:
 *   bookings + their payments, reminders, share links, any not-yet-accepted transfers
 *   they are party to (with paperwork purged), refresh tokens, and the user record.
 */
export const deleteOwnerAccount = async (userId: string): Promise<DeleteResult> => {
  const uid = new Types.ObjectId(userId);

  const vehicleCount = await Vehicle.countDocuments({ ownerId: uid });
  if (vehicleCount > 0) {
    return { deleted: false, reason: 'owns_vehicles', vehicleCount };
  }

  // Delete the owner's bookings (all completed/cancelled now) and their payments.
  const ownBookings = await Booking.find({ ownerId: uid }).select('_id').lean();
  await Payment.deleteMany({ bookingId: { $in: ownBookings.map((b) => b._id) } });
  await Booking.deleteMany({ ownerId: uid });

  await Reminder.deleteMany({ ownerId: uid });
  await TwinShare.deleteMany({ createdBy: uid });

  // Cancel any pending/requested transfers the user is party to and purge their
  // paperwork. Accepted transfers (ledger history) are intentionally left intact.
  const openTransfers = await OwnershipTransfer.find({
    $or: [{ fromOwnerId: uid }, { toOwnerId: uid }],
    status: { $in: ['pending', 'requested'] }
  })
    .select('_id')
    .lean();
  if (openTransfers.length) {
    const ids = openTransfers.map((t) => t._id);
    await purgePaperworkFor(ids);
    await OwnershipTransfer.updateMany({ _id: { $in: ids } }, { $set: { status: 'cancelled' } });
  }

  await RefreshToken.deleteMany({ userId: uid });
  await User.deleteOne({ _id: uid });

  return { deleted: true };
};
