/**
 * Builds a buyer-safe vehicle report from either a transfer token or a share token.
 * Reuses existing score, transfer-verification, and compliance services.
 * NEVER returns seller name, phone, email, address, full reg number, or user IDs.
 */
import { DocumentModel } from '../models/Document';
import { Booking }        from '../models/Booking';
import { Violation }      from '../models/Violation';
import { Challan }        from '../models/Challan';
import { Vehicle }        from '../models/Vehicle';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { TwinShare }      from '../models/TwinShare';
import { computeTwinScore }  from './twinScore.service';
import { verifyTransferToken, verifyShareToken } from './transfer.service';

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

const maskReg = (reg: string): string =>
  reg.length <= 6 ? '••••••' : reg.slice(0, 4) + '••••' + reg.slice(-2);

const DOC_LABELS: Record<string, string> = {
  rc:        'Registration Certificate (RC)',
  insurance: 'Insurance',
  puc:       'Pollution Certificate (PUC)',
};

export interface DocReport {
  type:                 string;
  label:                string;
  present:              boolean;
  verified:             boolean;
  expired:              boolean;
  expiryDate:           Date | null;
  issuedByBusinessName: string | null;
}

export interface BuyerReport {
  tokenType:    'transfer' | 'share';
  vehicleId:    string;        // needed by the mobile app to navigate post-accept
  car: {
    make:      string;
    model:     string;
    year:      number;
    fuelType:  string;
    type:      string;
    regNumber: string;   // masked
  };
  twinScore:      number;
  twinScoreLabel: string;
  documents:      DocReport[];
  serviceHistory: {
    count:  number;
    recent: Array<{ date: Date; documentType: string }>;
  };
  violationsLast12Months: {
    count:         number;
    documentTypes: string[];
  };
  pendingChallans: boolean;
  ownershipCount:  number;        // 1 = first owner, 2 = second, etc.
  previousOwners:  string[];      // ["Owner 1 (–2021)", "Owner 2 (2021–2023)"]
  redFlags:        string[];
  canAccept:       boolean;       // true only for a still-pending transfer token
}

export class BuyerReportError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

export async function buildBuyerReport(token: string): Promise<BuyerReport> {
  // ── 1. Verify token — try transfer first, then share ──────────────────────
  let tokenType: 'transfer' | 'share';
  let vehicleId: string;
  let canAccept = false;

  const transferParsed = (() => {
    try { return verifyTransferToken(token); }
    catch { return null; }
  })();

  if (transferParsed) {
    tokenType = 'transfer';
    const transfer = await OwnershipTransfer.findById(transferParsed.transferId);
    if (!transfer) throw new BuyerReportError('Transfer not found', 410);
    vehicleId = transfer.vehicleId.toString();
    canAccept = transfer.status === 'pending' && transfer.expiresAt > new Date();
  } else {
    // Try share token
    let shareParsed;
    try { shareParsed = verifyShareToken(token); }
    catch { throw new BuyerReportError('Invalid or expired token', 410); }

    tokenType = 'share';
    vehicleId = shareParsed.vehicleId;
    const share = await TwinShare.findOne({
      _id:       shareParsed.shareId,
      revoked:   false,
      expiresAt: { $gt: new Date() },
    });
    if (!share) throw new BuyerReportError('Share link has expired or been revoked', 410);
    canAccept = false;
  }

  // ── 2. Vehicle ────────────────────────────────────────────────────────────
  const vehicle = await Vehicle.findById(vehicleId!);
  if (!vehicle) throw new BuyerReportError('Vehicle not found', 404);

  // ── 3. Twin score ─────────────────────────────────────────────────────────
  const scoreResult = await computeTwinScore(vehicleId!, vehicle.fuelType);

  // ── 4. Required documents ─────────────────────────────────────────────────
  const requiredTypes = ['rc', 'insurance'];
  if (vehicle.fuelType === 'petrol' || vehicle.fuelType === 'diesel') requiredTypes.push('puc');

  const allDocs = await DocumentModel.find({ vehicleId: vehicleId! }).populate<{
    issuedByProviderId: { businessName: string } | null
  }>('issuedByProviderId', 'businessName');

  const now = Date.now();
  const documents: DocReport[] = requiredTypes.map((reqType) => {
    const doc = allDocs.find((d) => d.type === reqType);
    if (!doc) {
      return {
        type: reqType, label: DOC_LABELS[reqType] ?? reqType,
        present: false, verified: false, expired: false,
        expiryDate: null, issuedByBusinessName: null,
      };
    }
    const expired = new Date(doc.expiryDate).getTime() < now || doc.status === 'expired';
    return {
      type:     reqType,
      label:    DOC_LABELS[reqType] ?? reqType,
      present:  true,
      verified: doc.verified,
      expired,
      expiryDate:           doc.expiryDate,
      // NEVER return provider user details; only business name for verified docs
      issuedByBusinessName: doc.verified
        ? ((doc.issuedByProviderId as any)?.businessName ?? null)
        : null,
    };
  });

  // ── 5. Service history ────────────────────────────────────────────────────
  const totalServices = await Booking.countDocuments({ vehicleId: vehicleId!, status: 'completed' });
  const recentBookings = await Booking.find({ vehicleId: vehicleId!, status: 'completed' })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('documentType createdAt');

  // ── 6. Violations (last 12 months) ───────────────────────────────────────
  const twelveMonthsAgo = new Date(now - TWELVE_MONTHS_MS);
  const recentViolations = await Violation.find({
    vehicleId: vehicleId!,
    createdAt: { $gte: twelveMonthsAgo },
  }).select('documentTypeExpired');
  const violationDocTypes = [...new Set(recentViolations.flatMap((v) => v.documentTypeExpired))];

  // ── 7. Pending challans ───────────────────────────────────────────────────
  const pendingChallanCount = await Challan.countDocuments({ vehicleId: vehicleId!, status: 'pending' });

  // ── 8. Ownership chain — NO owner names or IDs ───────────────────────────
  const acceptedTransfers = await OwnershipTransfer.find({
    vehicleId: vehicleId!,
    status:    'accepted',
  }).sort({ acceptedAt: 1 });

  const ownershipCount  = acceptedTransfers.length + 1;
  const previousOwners  = acceptedTransfers.map((t, i) => {
    const prev    = i > 0 ? acceptedTransfers[i - 1].acceptedAt : null;
    const fromYr  = prev ? new Date(prev).getFullYear() : '—';
    const toYr    = t.acceptedAt ? new Date(t.acceptedAt).getFullYear() : '?';
    return `Owner ${i + 1} (${fromYr}–${toYr})`;
  });

  // ── 9. Red flags (plain language) ────────────────────────────────────────
  const redFlags: string[] = [];
  for (const doc of documents) {
    if (!doc.present)        redFlags.push(`${doc.label} is not on record`);
    else if (doc.expired)    redFlags.push(`${doc.label} has expired`);
    else if (!doc.verified)  redFlags.push(`${doc.label} has not been verified by an approved provider`);
  }
  if (pendingChallanCount > 0) {
    redFlags.push('This vehicle has unpaid fines (challans)');
  }
  if (recentViolations.length >= 1) {
    redFlags.push(
      `${recentViolations.length} traffic violation${recentViolations.length > 1 ? 's' : ''} recorded in the last 12 months`
    );
  }
  if (ownershipCount > 3) {
    redFlags.push(`Changed owners ${ownershipCount} times`);
  }
  if (scoreResult.total < 50) {
    redFlags.push('Low Twin Score — vehicle history needs attention');
  }

  return {
    tokenType,
    vehicleId: vehicleId!,
    car: {
      make:      vehicle.make,
      model:     vehicle.model,
      year:      vehicle.year,
      fuelType:  vehicle.fuelType,
      type:      vehicle.type,
      regNumber: maskReg(vehicle.regNumber),
    },
    twinScore:      scoreResult.total,
    twinScoreLabel: scoreResult.label,
    documents,
    serviceHistory: {
      count:  totalServices,
      recent: recentBookings.map((b) => ({ date: b.createdAt!, documentType: b.documentType })),
    },
    violationsLast12Months: { count: recentViolations.length, documentTypes: violationDocTypes },
    pendingChallans: pendingChallanCount > 0,
    ownershipCount,
    previousOwners,
    redFlags,
    canAccept,
  };
}
