import mongoose, { Schema, Types } from 'mongoose';

export interface ISlot {
  _id?: Types.ObjectId;
  providerId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  isBooked: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const SlotSchema = new Schema<ISlot>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    isBooked: { type: Boolean, default: false, required: true, index: true }
  },
  {
    timestamps: true
  }
);

SlotSchema.index({ providerId: 1, date: 1 });

export const Slot = mongoose.model<ISlot>('Slot', SlotSchema);
