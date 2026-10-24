import { Types } from 'mongoose';
import { DocumentModel } from '../models/Document';
import { Booking } from '../models/Booking';
import { Violation } from '../models/Violation';
import { Challan } from '../models/Challan';

export interface TwinScoreBreakdown {
  documents:  { score: number; max: 45; verifiedCount: number; requiredCount: number };
  services:   { score: number; max: 20; recentCompleted: number };
  violations: { score: number; max: 20; recentViolations: number };
  challans:   { score: number; max: 15; pendingChallans: number };
}

export interface TwinScoreResult {
  total: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  breakdown: TwinScoreBreakdown;
}

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Computes the 0–100 Twin Score for a vehicle.
 * CRITICAL: Unverified (owner-uploaded) documents contribute ZERO to the score.
 */
export const computeTwinScore = async (
  vehicleId: string | Types.ObjectId,
  fuelType: string
): Promise<TwinScoreResult> => {
  const now = Date.now();
  const twelveMonthsAgo = new Date(now - TWELVE_MONTHS_MS);
  const vid = vehicleId.toString();

  // ── Documents: 45 pts ─────────────────────────────────────────────────────
  // Required types: rc + insurance always; add puc for petrol/diesel
  const requiredTypes = ['rc', 'insurance'];
  if (fuelType === 'petrol' || fuelType === 'diesel') requiredTypes.push('puc');

  const docs = await DocumentModel.find({ vehicleId: vid });
  let verifiedCount = 0;
  for (const reqType of requiredTypes) {
    const doc = docs.find((d) => d.type === reqType);
    // A document only counts when provider-verified AND not expired
    if (doc && doc.verified && new Date(doc.expiryDate).getTime() >= now && doc.status !== 'expired') {
      verifiedCount++;
    }
    // Unverified docs explicitly count as ZERO — no else branch needed
  }
  const docScore = Math.round(45 * verifiedCount / requiredTypes.length);

  // ── Service history: 20 pts ───────────────────────────────────────────────
  const recentCompleted = await Booking.countDocuments({
    vehicleId: vid,
    status: 'completed',
    createdAt: { $gte: twelveMonthsAgo }
  });
  const serviceScore = recentCompleted === 0 ? 0 : recentCompleted === 1 ? 10 : 20;

  // ── Violations: 20 pts ────────────────────────────────────────────────────
  const recentViolations = await Violation.countDocuments({
    vehicleId: vid,
    createdAt: { $gte: twelveMonthsAgo }
  });
  const violationScore = Math.max(0, 20 - 5 * recentViolations);

  // ── Challans: 15 pts ──────────────────────────────────────────────────────
  const pendingChallans = await Challan.countDocuments({ vehicleId: vid, status: 'pending' });
  const challanScore = pendingChallans === 0 ? 15 : 0;

  const total = docScore + serviceScore + violationScore + challanScore;
  const label =
    total >= 85 ? 'Excellent' :
    total >= 70 ? 'Good' :
    total >= 50 ? 'Fair' :
    'Needs Attention';

  return {
    total,
    label,
    breakdown: {
      documents:  { score: docScore,      max: 45, verifiedCount,     requiredCount: requiredTypes.length },
      services:   { score: serviceScore,  max: 20, recentCompleted },
      violations: { score: violationScore,max: 20, recentViolations },
      challans:   { score: challanScore,  max: 15, pendingChallans }
    }
  };
};

/** Safe preview summary used by transfer preview and public share endpoints. */
export const buildSafeScoreSummary = (result: TwinScoreResult, vehicleId: string) => ({
  twinScore:      result.total,
  twinScoreLabel: result.label,
  scoreBreakdown: result.breakdown
});
