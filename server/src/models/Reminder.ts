import mongoose, { Schema, Types } from 'mongoose';

export type ReminderChannel = 'push' | 'sms' | 'whatsapp' | 'email';

export interface IReminder {
  _id?: Types.ObjectId;
  documentId: Types.ObjectId;
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
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
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
