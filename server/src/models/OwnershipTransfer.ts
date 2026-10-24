import mongoose, { Schema, Types } from 'mongoose';

export type TransferStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';

export interface ITransferSnapshot {
  score: number;
  verifiedDocTypes: string[];
  completedServiceCount: number;
  violationCount: number;
  ownershipIndex: number;
}

export interface IOwnershipTransfer {
  _id?: Types.ObjectId;
  vehicleId: Types.ObjectId;
  fromOwnerId: Types.ObjectId;
  toOwnerId: Types.ObjectId | null;
  status: TransferStatus;
  expiresAt: Date;
  snapshot: ITransferSnapshot;
  snapshotHash: string;
  prevHash: string;
  hash: string;
  createdAt?: Date;
  acceptedAt?: Date | null;
}

const OwnershipTransferSchema = new Schema<IOwnershipTransfer>(
  {
    vehicleId:    { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    fromOwnerId:  { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    toOwnerId:    { type: Schema.Types.ObjectId, ref: 'User',    default: null },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'cancelled', 'expired'],
      default: 'pending',
      required: true,
      index: true
    },
    expiresAt: { type: Date, required: true },
    snapshot: {
      score:                 { type: Number, required: true },
      verifiedDocTypes:      { type: [String], default: [] },
      completedServiceCount: { type: Number, required: true },
      violationCount:        { type: Number, required: true },
      ownershipIndex:        { type: Number, required: true }
    },
    snapshotHash: { type: String, default: '' },
    prevHash:     { type: String, default: '' },
    hash:         { type: String, default: '' },
    acceptedAt:   { type: Date, default: null }
  },
  { timestamps: true }
);

OwnershipTransferSchema.index({ vehicleId: 1, status: 1 });

export const OwnershipTransfer = mongoose.model<IOwnershipTransfer>('OwnershipTransfer', OwnershipTransferSchema);
