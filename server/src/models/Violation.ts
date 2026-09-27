import mongoose, { Schema, Types } from 'mongoose';

export interface IViolation {
  _id?: Types.ObjectId;
  vehicleId: Types.ObjectId;
  officerId: Types.ObjectId;
  documentTypeExpired: string[];
  location: string;
  notes: string;
  challanId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ViolationSchema = new Schema<IViolation>(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    officerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentTypeExpired: { type: [String], required: true },
    location: { type: String, required: true },
    notes: { type: String, default: '' },
    challanId: { type: Schema.Types.ObjectId, ref: 'Challan', default: null }
  },
  {
    timestamps: true
  }
);

export const Violation = mongoose.model<IViolation>('Violation', ViolationSchema);
