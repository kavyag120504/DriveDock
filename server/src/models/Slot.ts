import mongoose, { Schema, Types } from 'mongoose';

export interface ISlot {
  _id?: Types.ObjectId;
  providerId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  capacity: number; // vehicles the centre can service at the same time in this window
  bookedCount: number;
  isBooked: boolean; // true once bookedCount reaches capacity
  createdAt?: Date;
  updatedAt?: Date;
}

const SlotSchema = new Schema<ISlot>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    capacity: { type: Number, default: 1, min: 1 },
    bookedCount: { type: Number, default: 0, min: 0 },
    isBooked: { type: Boolean, default: false, required: true, index: true }
  },
  {
    timestamps: true
  }
);

// A new slot created already marked as booked (seed data) is fully booked
SlotSchema.pre('validate', function (next) {
  if (this.isNew && this.isBooked && this.bookedCount === 0) {
    this.bookedCount = this.capacity;
  }
  next();
});

SlotSchema.index({ providerId: 1, date: 1 });

/** Today's date as YYYY-MM-DD in the server's local time zone (slot dates are stored this way). */
export const todayDateString = (): string => new Date().toLocaleDateString('en-CA');

export const Slot = mongoose.model<ISlot>('Slot', SlotSchema);
