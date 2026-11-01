import mongoose, { Schema, Types } from 'mongoose';
import { DocumentType } from './Document';

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type BookingCancellationReason = 'payment_timeout' | 'cancelled';

export interface IBooking {
  _id?: Types.ObjectId;
  ownerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  providerId: Types.ObjectId;
  slotId: Types.ObjectId;
  documentType: DocumentType;
  status: BookingStatus;
  paymentId?: Types.ObjectId | null;
  certificateUrl?: string;
  notes?: string;
  cancellationReason?: BookingCancellationReason | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    providerId: { type: Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    slotId: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
    documentType: {
      type: String,
      enum: ['insurance', 'puc', 'rc', 'license', 'fitness'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending',
      required: true
    },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    certificateUrl: { type: String, default: '' },
    notes: { type: String, default: '' },
    // 'payment_timeout' = released automatically because it stayed unpaid; 'cancelled' = cancelled by provider/admin
    cancellationReason: { type: String, enum: ['payment_timeout', 'cancelled', null], default: null }
  },
  {
    timestamps: true
  }
);

BookingSchema.index({ ownerId: 1, createdAt: -1 });
BookingSchema.index({ providerId: 1, status: 1 });
// One active booking per vehicle and document: while a renewal is pending or confirmed,
// the database refuses a second one, even if two requests arrive at the same moment
BookingSchema.index(
  { vehicleId: 1, documentType: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } }, name: 'one_active_booking_per_vehicle_document' }
);

export const Booking = mongoose.model<IBooking>('Booking', BookingSchema);
