import { Types } from 'mongoose';
import { TokenPayload } from './tokenService';
import { Provider } from '../models/Provider';

/**
 * Ownership rule applied to every vehicle, document, booking, payment, reminder and challan:
 * - an owner can only reach their own records
 * - a provider can only reach bookings assigned to them
 * - admin can reach everything
 */

/** Mongo filter limiting owner-scoped collections (vehicles, bookings) to what the caller may reach. */
export const ownerScope = (user: TokenPayload): Record<string, any> => {
  return user.role === 'admin' ? {} : { ownerId: user.userId };
};

/** True when the caller is the record's owner or an admin. */
export const isOwnerOrAdmin = (user: TokenPayload, ownerId: Types.ObjectId | string): boolean => {
  return user.role === 'admin' || ownerId.toString() === user.userId;
};

/** True when the caller is the booking's owner, the provider assigned to it, or an admin. */
export const canAccessBooking = async (
  user: TokenPayload,
  booking: { ownerId: Types.ObjectId; providerId: Types.ObjectId }
): Promise<boolean> => {
  if (isOwnerOrAdmin(user, booking.ownerId)) {
    return true;
  }

  if (user.role === 'provider') {
    const provider = await Provider.findOne({ userId: user.userId });
    return !!provider && provider._id.toString() === booking.providerId.toString();
  }

  return false;
};
