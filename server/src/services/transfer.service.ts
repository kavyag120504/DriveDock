import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { OwnershipTransfer } from '../models/OwnershipTransfer';

// ── Token shapes ─────────────────────────────────────────────────────────────

export interface TransferTokenPayload {
  purpose: 'transfer';
  transferId: string;
}

export interface ShareTokenPayload {
  purpose: 'twinShare';
  shareId: string;
  vehicleId: string;
}

// ── Transfer tokens (10-minute, TRANSFER_SECRET) ─────────────────────────────

export const generateTransferToken = (transferId: string): string =>
  jwt.sign({ purpose: 'transfer', transferId } as TransferTokenPayload, ENV.TRANSFER_SECRET, {
    expiresIn: '10m'
  });

export const verifyTransferToken = (token: string): TransferTokenPayload => {
  const payload = jwt.verify(token, ENV.TRANSFER_SECRET) as TransferTokenPayload;
  if (payload.purpose !== 'transfer') throw new Error('Wrong token purpose');
  return payload;
};

// ── Share tokens (7-day, TWIN_SHARE_SECRET) ───────────────────────────────────

export const generateShareToken = (shareId: string, vehicleId: string): string =>
  jwt.sign({ purpose: 'twinShare', shareId, vehicleId } as ShareTokenPayload, ENV.TWIN_SHARE_SECRET, {
    expiresIn: '7d'
  });

export const verifyShareToken = (token: string): ShareTokenPayload => {
  const payload = jwt.verify(token, ENV.TWIN_SHARE_SECRET) as ShareTokenPayload;
  if (payload.purpose !== 'twinShare') throw new Error('Wrong token purpose');
  return payload;
};

// ── Ledger hashing ────────────────────────────────────────────────────────────

export const computeSnapshotHash = (snapshot: object): string =>
  crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

export const computeHash = (
  prevHash: string,
  vehicleId: string,
  fromOwnerId: string,
  toOwnerId: string,
  acceptedAt: Date,
  snapshotHash: string
): string =>
  crypto
    .createHash('sha256')
    .update(prevHash + vehicleId + fromOwnerId + toOwnerId + acceptedAt.toISOString() + snapshotHash)
    .digest('hex');

/**
 * Recomputes every hash in the vehicle's accepted-transfer chain and reports
 * whether any record has been tampered with.
 */
export const verifyLedger = async (
  vehicleId: string
): Promise<{ intact: boolean; chain: Array<{ transferId: string; from: string; to: string; acceptedAt: Date; hashValid: boolean }> }> => {
  const transfers = await OwnershipTransfer.find(
    { vehicleId, status: 'accepted' }
  ).sort({ acceptedAt: 1 });

  let prevHash = 'GENESIS';
  let intact = true;

  const chain = transfers.map((t) => {
    const expected = computeHash(
      prevHash,
      vehicleId,
      t.fromOwnerId.toString(),
      t.toOwnerId!.toString(),
      t.acceptedAt!,
      t.snapshotHash
    );
    const hashValid = expected === t.hash;
    if (!hashValid) intact = false;
    prevHash = t.hash;

    return {
      transferId: t._id!.toString(),
      from: t.fromOwnerId.toString(),
      to: t.toOwnerId!.toString(),
      acceptedAt: t.acceptedAt!,
      hashValid
    };
  });

  return { intact, chain };
};
