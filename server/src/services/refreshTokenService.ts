import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { ENV } from '../config/env';
import { TokenPayload } from './tokenService';
import { RefreshToken } from '../models/RefreshToken';

/**
 * Stateful refresh tokens (Phase 2 auth hardening). A refresh token stays a signed
 * JWT, but every one is recorded (by hash) in the RefreshToken store so it can be
 * rotated on use, revoked server-side, and grouped into a reuse-detection `family`.
 * See models/RefreshToken.ts. Access tokens are unchanged (short-lived, stateless).
 */

/** Thrown when a refresh token is unknown, already used (reuse), revoked, or expired. */
export class RefreshError extends Error {
  constructor(public reason: 'unknown' | 'reuse' | 'revoked' | 'expired') {
    super(`refresh token ${reason}`);
    this.name = 'RefreshError';
  }
}

const REFRESH_TTL = '7d';

const hashToken = (raw: string): string => crypto.createHash('sha256').update(raw).digest('hex');

const newId = (): string => crypto.randomBytes(16).toString('hex');

/**
 * Sign a refresh JWT carrying a unique `jti` + rotation `family`, and record it in
 * the store by hash. Pass an existing `family` when rotating so descendants stay
 * grouped. Returns the raw token string (the only place it ever exists un-hashed).
 */
export const issueRefreshToken = async (
  payload: TokenPayload,
  device: string,
  family: string = newId()
): Promise<string> => {
  const raw = jwt.sign({ ...payload, jti: newId(), family }, ENV.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  const decoded = jwt.decode(raw) as { exp: number };
  await RefreshToken.create({
    userId: new Types.ObjectId(payload.userId),
    tokenHash: hashToken(raw),
    family,
    device: device.slice(0, 200),
    expiresAt: new Date(decoded.exp * 1000)
  });
  return raw;
};

/**
 * Rotate a presented refresh token: validate it against the store, mark it used, and
 * issue a fresh token in the same family. Throws RefreshError (→ controller maps to
 * 401) for an unknown/expired token; on REUSE of an already-rotated or revoked token
 * it revokes the whole family first (refresh-token-theft defence). The JWT signature
 * itself must already be verified by the caller.
 */
export const rotateRefreshToken = async (raw: string, payload: TokenPayload, device: string): Promise<string> => {
  const record = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
  if (!record) throw new RefreshError('unknown');

  if (record.revokedAt || record.replacedByHash) {
    // This token was already rotated or explicitly revoked but is being presented
    // again — treat the whole family as compromised.
    await revokeFamily(record.family);
    throw new RefreshError('reuse');
  }
  if (record.expiresAt.getTime() <= Date.now()) throw new RefreshError('expired');

  const newRaw = await issueRefreshToken(payload, device, record.family);
  record.replacedByHash = hashToken(newRaw);
  record.revokedAt = new Date();
  record.lastUsedAt = new Date();
  await record.save();
  return newRaw;
};

/** Revoke a single presented token (logout on this device). No-op if unknown. */
export const revokeRefreshToken = async (raw: string): Promise<void> => {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(raw), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

/** Revoke every token in a rotation family (used on reuse detection). */
export const revokeFamily = async (family: string): Promise<void> => {
  await RefreshToken.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

/** Revoke every active token for a user ("log out everywhere"). Returns the count. */
export const revokeAllForUser = async (userId: string): Promise<number> => {
  const res = await RefreshToken.updateMany(
    { userId: new Types.ObjectId(userId), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return res.modifiedCount ?? 0;
};

/** List a user's active (non-revoked, non-expired) sessions for the device list. */
export const listActiveSessions = async (userId: string) => {
  const rows = await RefreshToken.find({
    userId: new Types.ObjectId(userId),
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  })
    .sort({ createdAt: -1 })
    .select('device createdAt lastUsedAt expiresAt');

  return rows.map((r) => ({
    id: r._id,
    device: r.device || 'Unknown device',
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    expiresAt: r.expiresAt
  }));
};
