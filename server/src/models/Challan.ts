import mongoose, { Schema, Types } from 'mongoose';

export type ChallanStatus = 'pending' | 'paid';

export interface IChallan {
  _id?: Types.ObjectId;
  vehicleId: Types.ObjectId;
  amount: number;
  reason: string;
  status: ChallanStatus;
  issuedAt: Date;
  paidAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ChallanSchema = new Schema<IChallan>(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
      required: true,
      index: true
    },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date }
  },
  {
    timestamps: true
  }
);

export const Challan = mongoose.model<IChallan>('Challan', ChallanSchema);
