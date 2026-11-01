import mongoose, { Schema, Types } from 'mongoose';

export type ReminderChannel = 'push' | 'sms' | 'whatsapp' | 'email';

export type ReminderKind = 'document' | 'transfer';

export interface IReminder {
  _id?: Types.ObjectId;
  /** Set for document-expiry reminders; absent for ownership-transfer paperwork reminders. */
  documentId?: Types.ObjectId | null;
  kind: ReminderKind;
  /** Transfer reminders only: the transfer, the checklist step, and the confirmed sale date it was worked out from. */
  transferId?: Types.ObjectId | null;
  taskKey?: string;
  anchorDate?: string; // YYYY-MM-DD
  vehicleId: Types.ObjectId;
  ownerId: Types.ObjectId;
  scheduledFor: Date;
  channel: ReminderChannel;
  thresholdDays: number;
  message: string;
  sent: boolean;
  sentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
    // Existing rows have no kind and count as document reminders
    kind: { type: String, enum: ['document', 'transfer'], default: 'document', index: true },
    transferId: { type: Schema.Types.ObjectId, ref: 'OwnershipTransfer', default: null, index: true },
    taskKey: { type: String },
    anchorDate: { type: String },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduledFor: { type: Date, required: true, index: true },
    channel: {
      type: String,
      enum: ['push', 'sms', 'whatsapp', 'email'],
      default: 'push'
    },
    thresholdDays: { type: Number, required: true },
    message: { type: String, required: true },
    sent: { type: Boolean, default: false, index: true },
    sentAt: { type: Date }
  },
  {
    timestamps: true
  }
);

ReminderSchema.index({ scheduledFor: 1, sent: 1 });

export const Reminder = mongoose.model<IReminder>('Reminder', ReminderSchema);
