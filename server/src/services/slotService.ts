import { FilterQuery, Types } from 'mongoose';
import { Slot, ISlot } from '../models/Slot';

// Slots written before capacity existed have no bookedCount/capacity: derive them from isBooked
const seatsTaken = { $ifNull: ['$bookedCount', { $cond: ['$isBooked', 1, 0] }] };
const seatsTotal = { $ifNull: ['$capacity', 1] };

/**
 * TRUST RULE 4: atomically takes one seat in a slot. Returns null when the slot is full.
 * The filter is re-checked by MongoDB at write time, so concurrent requests can never
 * take more seats than the slot's capacity.
 */
export const reserveSeat = (filter: FilterQuery<ISlot>) =>
  Slot.findOneAndUpdate({ ...filter, isBooked: false }, [
    { $set: { bookedCount: { $add: [seatsTaken, 1] }, capacity: seatsTotal } },
    { $set: { isBooked: { $gte: ['$bookedCount', '$capacity'] } } }
  ], { new: true });

/** Gives one seat back (booking cancelled or left unpaid). Call at most once per booking. */
export const releaseSeat = (slotId: Types.ObjectId | string) =>
  Slot.findByIdAndUpdate(slotId, [
    { $set: { bookedCount: { $max: [0, { $subtract: [seatsTaken, 1] }] }, capacity: seatsTotal } },
    { $set: { isBooked: { $gte: ['$bookedCount', '$capacity'] } } }
  ], { new: true });
