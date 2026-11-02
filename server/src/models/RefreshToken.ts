import mongoose, { Schema, Types } from 'mongoose';

/**
 * Server-side refresh-token store (Phase 2 auth hardening).
 *
 * A refresh token is still a signed JWT, but each one is ALSO recorded here by the
 * SHA-256 hash of its string (never the raw token), so the server can:
 *  - rotate on every use (the old token is marked replaced and can't be used again);
 *  - detect reuse of an already-rotated/revoked token and revoke the whole `family`
 *    (classic refresh-token-theft defence);
 *  - revoke a single device or every device ("log out everywhere");
 *  - list a user's active sessions (device + timestamps).
 *
 * Tokens expire via a TTL index on `expiresAt`, so stale rows self-clean.
 */

export interface IRefreshToken {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  /** SHA-256 hex of the raw JWT string. The raw token is never stored. */
  tokenHash: string;
  /** Rotation family: all descendants of one login share it; reuse revokes the family. */
  family: string;
  /** Best-effort device label (user-agent or client-supplied), for the sessions list. */
  device: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  /** Set when this token is rotated; its presence means "already used". */
  replacedByHash?: string | null;
  createdAt?: Date;
  lastUsedAt?: Date | null;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    device: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    lastUsedAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Auto-remove rows once expired (TTL). A revoked-but-unexpired row is kept until then
// so reuse detection still works for the rest of the original 7-day window.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
