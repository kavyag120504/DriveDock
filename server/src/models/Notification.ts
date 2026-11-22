import mongoose, { Schema, Types } from 'mongoose';

/** In-app inbox entry. Every push notification is also stored here, so it is not lost when a push is not delivered. */
export interface INotification {
  userId: Types.ObjectId;
  title: string;
  body: string;
  /** e.g. booking_confirmed, booking_completed, booking_cancelled, challan_issued, transfer_requested, provider_status */
  kind: string;
  data?: Record<string, unknown>;
  readAt?: Date | null;
  createdAt?: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 400 },
    kind: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
// Inbox entries are kept for 90 days.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
