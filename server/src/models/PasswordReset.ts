import mongoose, { Schema, Types } from 'mongoose';

/** One password-reset code. Only a keyed hash of the code is stored, never the code. Expired rows delete themselves. */
export interface IPasswordReset {
  userId: Types.ObjectId;
  channel: 'email' | 'sms';
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt?: Date;
}

const PasswordResetSchema = new Schema<IPasswordReset>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// MongoDB removes the row shortly after it expires.
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = mongoose.model<IPasswordReset>('PasswordReset', PasswordResetSchema);
