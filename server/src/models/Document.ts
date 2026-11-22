import mongoose, { Schema, Types } from 'mongoose';
import { signFileUrl } from '../services/fileAccess';

export type DocumentType = 'insurance' | 'puc' | 'rc' | 'license' | 'fitness';
export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired';
export type DocumentUpdatedBy = 'owner' | 'provider' | 'registry';
export type RcCheckOutcome = 'verified' | 'record_matched' | 'expired' | 'inactive' | 'unconfirmed' | 'not_found';

export interface IRcRegistryVerification {
  provider: 'arya' | 'apiexpress' | 'cashfree' | 'idfy' | 'stampmitra';
  /** Vendor test environment (canned data). Recorded for display only; never changes verification. */
  testMode?: boolean;
  referenceId: string;
  registrationNumber: string;
  checkedAt: Date;
  outcome: RcCheckOutcome;
  registryStatus: string;
  rcValidUpto?: Date | null;
  fileHash: string;
}

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
  verificationSource?: 'provider' | 'arya' | 'apiexpress' | 'cashfree' | 'idfy' | 'stampmitra' | null;
  registryVerification?: IRcRegistryVerification;
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
      enum: ['owner', 'provider', 'registry'],
      required: true,
      default: 'owner'
    },
    // CRITICAL TRUST RULE 1: Verified MUST default to false.
    // Uploading a photo for personal tracking does NOT verify it.
    // Approved provider completion, or a complete RC registry check, can verify a record.
    verified: {
      type: Boolean,
      default: false,
      required: true
    },
    issuedByProviderId: {
      type: Schema.Types.ObjectId,
      ref: 'Provider',
      default: null
    },
    verificationSource: { type: String, enum: ['provider', 'arya', 'apiexpress', 'cashfree', 'idfy', 'stampmitra', null], default: null },
    registryVerification: {
      type: new Schema({
        provider: { type: String, enum: ['arya', 'apiexpress', 'cashfree', 'idfy', 'stampmitra'], required: true },
        testMode: { type: Boolean, default: false },
        referenceId: { type: String, required: true },
        registrationNumber: { type: String, required: true },
        checkedAt: { type: Date, required: true },
        outcome: { type: String, enum: ['verified', 'record_matched', 'expired', 'inactive', 'unconfirmed', 'not_found'], required: true },
        registryStatus: { type: String, required: true },
        rcValidUpto: { type: Date, default: null },
        fileHash: { type: String, required: true }
      }, { _id: false }),
      default: undefined
    }
  },
  {
    timestamps: true,
    // Private file storage: the stored link never leaves the server as-is; JSON gets a short-lived signed link.
    toJSON: { transform: (_doc, ret: any) => { if (ret.fileUrl) ret.fileUrl = signFileUrl(ret.fileUrl); return ret; } }
  }
);

DocumentSchema.index({ vehicleId: 1, type: 1 });

export const DocumentModel = mongoose.model<IDocument>('Document', DocumentSchema);
