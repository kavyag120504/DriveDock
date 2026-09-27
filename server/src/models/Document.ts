import mongoose, { Schema, Types } from 'mongoose';

export type DocumentType = 'insurance' | 'puc' | 'rc' | 'license' | 'fitness';
export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired';
export type DocumentUpdatedBy = 'owner' | 'provider';

export interface IDocument {
  _id?: Types.ObjectId;
  vehicleId: Types.ObjectId;
  type: DocumentType;
  fileUrl: string;
  fileHash: string;
  issueDate: Date;
  expiryDate: Date;
  status: DocumentStatus;
  lastUpdatedBy: DocumentUpdatedBy;
  verified: boolean;
  issuedByProviderId?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    type: {
      type: String,
      enum: ['insurance', 'puc', 'rc', 'license', 'fitness'],
      required: true
    },
    fileUrl: { type: String, required: true },
    fileHash: { type: String, default: '' },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['valid', 'expiring_soon', 'expired'],
      default: 'valid'
    },
    lastUpdatedBy: {
      type: String,
      enum: ['owner', 'provider'],
      required: true,
      default: 'owner'
    },
    // CRITICAL TRUST RULE 1: Verified MUST default to false.
    // Uploading a photo for personal tracking does NOT verify it.
    // Only an approved provider completing a booking updates verified: true.
    verified: {
      type: Boolean,
      default: false,
      required: true
    },
    issuedByProviderId: {
      type: Schema.Types.ObjectId,
      ref: 'Provider',
      default: null
    }
  },
  {
    timestamps: true
  }
);

DocumentSchema.index({ vehicleId: 1, type: 1 });

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
