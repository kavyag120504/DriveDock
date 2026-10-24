import mongoose, { Schema, Types } from 'mongoose';

export interface ITwinShare {
  _id?: Types.ObjectId;
  vehicleId: Types.ObjectId;
  createdBy: Types.ObjectId;
  expiresAt: Date;
  revoked: boolean;
  createdAt?: Date;
}

const TwinShareSchema = new Schema<ITwinShare>(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    expiresAt: { type: Date, required: true },
    revoked:   { type: Boolean, default: false, required: true }
  },
  { timestamps: true }
);

export const TwinShare = mongoose.model<ITwinShare>('TwinShare', TwinShareSchema);
