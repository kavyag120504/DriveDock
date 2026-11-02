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
