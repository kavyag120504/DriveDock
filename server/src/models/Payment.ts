import mongoose, { Schema, Types } from 'mongoose';

export type PaymentStatus = 'created' | 'paid' | 'failed';

export interface IPayment {
  _id?: Types.ObjectId;
  bookingId: Types.ObjectId;
  amount: number;
  currency: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
      required: true
    }
  },
  {
    timestamps: true
  }
);

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
