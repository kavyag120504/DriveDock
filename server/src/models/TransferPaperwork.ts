import mongoose, { Schema, Types } from 'mongoose';

export type IdType = 'aadhaar' | 'pan' | 'voter' | 'passport' | 'dl';
export type StepStatus = 'done' | 'skipped';

export interface IParty {
  fullName?: string;
  relation?: string; // S/o, D/o, W/o, C/o
  guardianName?: string;
  address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  mobile?: string;
  email?: string;
  idType?: IdType;
  idLast4?: string; // never more than the last 4 characters
}

export interface ITransferPaperwork {
  _id?: Types.ObjectId;
  transferId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  sellerId: Types.ObjectId;
  buyerId?: Types.ObjectId | null;
  seller?: IParty;
  buyer?: IParty;
  vehicle?: { chassisNo?: string; engineNo?: string; colour?: string; registrationDate?: string };
  sale?: { date?: string; price?: number; odometerKm?: number; dateConfirmedAt?: Date | null };
  loan?: { hypothecated?: boolean; bankName?: string };
  insurance?: { insurerName?: string; policyNumber?: string; sellerConsent?: boolean; buyerPlan?: 'transfer' | 'new' };
  steps: Array<{ key: string; status: StepStatus; at: Date }>;
  personalDataClearedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// Fields holding personal data are stored encrypted (see services/paperworkFields.ts), so they are
// plain strings here and carry no length limits.
const PartySchema = {
  fullName: String,
  relation: { type: String, enum: ['S/o', 'D/o', 'W/o', 'C/o'] },
  guardianName: String,
  address: { line1: String, line2: String, city: String, state: String, pincode: String },
  mobile: String,
  email: String,
  idType: { type: String, enum: ['aadhaar', 'pan', 'voter', 'passport', 'dl'] },
  idLast4: String
};

const TransferPaperworkSchema = new Schema<ITransferPaperwork>(
  {
    transferId: { type: Schema.Types.ObjectId, ref: 'OwnershipTransfer', required: true, unique: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    seller: PartySchema,
    buyer: PartySchema,
    vehicle: { chassisNo: String, engineNo: String, colour: String, registrationDate: String },
    sale: {
      date: String, // YYYY-MM-DD
      price: Number,
      odometerKm: Number,
      dateConfirmedAt: { type: Date, default: null }
    },
    loan: { hypothecated: Boolean, bankName: String },
    insurance: {
      insurerName: String,
      policyNumber: String,
      sellerConsent: Boolean,
      buyerPlan: { type: String, enum: ['transfer', 'new'] }
    },
    steps: {
      type: [
        {
          _id: false,
          key: { type: String, required: true },
          status: { type: String, enum: ['done', 'skipped'], required: true },
          at: { type: Date, required: true }
        }
      ],
      default: []
    },
    personalDataClearedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const TransferPaperwork = mongoose.model<ITransferPaperwork>('TransferPaperwork', TransferPaperworkSchema);
