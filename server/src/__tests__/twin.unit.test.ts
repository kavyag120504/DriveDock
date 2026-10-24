/**
 * Unit tests for:
 *  1. Twin Score formula — each component independently, unverified docs = 0
 *  2. Ledger hash chain — tamper detection
 *
 * No database required; all DB calls are mocked.
 */

import { computeTwinScore } from '../services/twinScore.service';
import { computeHash, computeSnapshotHash, verifyLedger } from '../services/transfer.service';
import { OwnershipTransfer } from '../models/OwnershipTransfer';

// ── Mock Mongoose models ─────────────────────────────────────────────────────

jest.mock('../models/Document', () => ({
  DocumentModel: { find: jest.fn() }
}));
jest.mock('../models/Booking', () => ({
  Booking: { countDocuments: jest.fn() }
}));
jest.mock('../models/Violation', () => ({
  Violation: { countDocuments: jest.fn() }
}));
jest.mock('../models/Challan', () => ({
  Challan: { countDocuments: jest.fn() }
}));
jest.mock('../models/OwnershipTransfer', () => ({
  OwnershipTransfer: { find: jest.fn() }
}));

import { DocumentModel } from '../models/Document';
import { Booking } from '../models/Booking';
import { Violation } from '../models/Violation';
import { Challan } from '../models/Challan';

const mockDocs   = DocumentModel.find     as jest.Mock;
const mockBook   = Booking.countDocuments as jest.Mock;
const mockViol   = Violation.countDocuments as jest.Mock;
const mockChall  = Challan.countDocuments   as jest.Mock;
const mockOTFind = (OwnershipTransfer as any).find as jest.Mock;

const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const PAST   = new Date(Date.now() - 1000);
const VID    = 'vehicleId123';

// ── Score formula ─────────────────────────────────────────────────────────────

describe('Twin Score — document component (45 pts)', () => {
  beforeEach(() => {
    mockBook.mockResolvedValue(0);
    mockViol.mockResolvedValue(0);
    mockChall.mockResolvedValue(0);
  });

  test('all required docs verified and valid → 45 pts (petrol)', async () => {
    mockDocs.mockResolvedValue([
      { type: 'rc',        verified: true, expiryDate: FUTURE, status: 'valid' },
      { type: 'insurance', verified: true, expiryDate: FUTURE, status: 'valid' },
      { type: 'puc',       verified: true, expiryDate: FUTURE, status: 'valid' }
    ]);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.documents.score).toBe(45);
  });

  test('all required docs verified and valid → 45 pts (ev — no puc required)', async () => {
    mockDocs.mockResolvedValue([
      { type: 'rc',        verified: true, expiryDate: FUTURE, status: 'valid' },
      { type: 'insurance', verified: true, expiryDate: FUTURE, status: 'valid' }
    ]);
    const result = await computeTwinScore(VID, 'ev');
    expect(result.breakdown.documents.score).toBe(45);
  });

  test('UNVERIFIED doc counts as ZERO — owner upload must not raise score', async () => {
    mockDocs.mockResolvedValue([
      { type: 'rc',        verified: false, expiryDate: FUTURE, status: 'valid' },
      { type: 'insurance', verified: true,  expiryDate: FUTURE, status: 'valid' },
      { type: 'puc',       verified: true,  expiryDate: FUTURE, status: 'valid' }
    ]);
    const result = await computeTwinScore(VID, 'petrol');
    // Only 2 of 3 verified → 45 * 2/3 = 30
    expect(result.breakdown.documents.score).toBe(30);
  });

  test('expired verified doc counts as ZERO', async () => {
    mockDocs.mockResolvedValue([
      { type: 'rc',        verified: true, expiryDate: PAST, status: 'expired' },
      { type: 'insurance', verified: true, expiryDate: FUTURE, status: 'valid' },
      { type: 'puc',       verified: true, expiryDate: FUTURE, status: 'valid' }
    ]);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.documents.score).toBe(30);
  });

  test('no docs at all → 0 pts', async () => {
    mockDocs.mockResolvedValue([]);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.documents.score).toBe(0);
  });
});

describe('Twin Score — service history (20 pts)', () => {
  beforeEach(() => {
    mockDocs.mockResolvedValue([]);
    mockViol.mockResolvedValue(0);
    mockChall.mockResolvedValue(0);
  });

  test('0 completed bookings → 0 pts', async () => {
    mockBook.mockResolvedValue(0);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.services.score).toBe(0);
  });

  test('1 completed booking → 10 pts', async () => {
    mockBook.mockResolvedValue(1);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.services.score).toBe(10);
  });

  test('2+ completed bookings → 20 pts', async () => {
    mockBook.mockResolvedValue(5);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.services.score).toBe(20);
  });
});

describe('Twin Score — violations (20 pts)', () => {
  beforeEach(() => {
    mockDocs.mockResolvedValue([]);
    mockBook.mockResolvedValue(0);
    mockChall.mockResolvedValue(0);
  });

  test('0 violations → 20 pts', async () => {
    mockViol.mockResolvedValue(0);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.violations.score).toBe(20);
  });

  test('2 violations → 10 pts', async () => {
    mockViol.mockResolvedValue(2);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.violations.score).toBe(10);
  });

  test('5+ violations → 0 pts minimum', async () => {
    mockViol.mockResolvedValue(10);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.violations.score).toBe(0);
  });
});

describe('Twin Score — challans (15 pts)', () => {
  beforeEach(() => {
    mockDocs.mockResolvedValue([]);
    mockBook.mockResolvedValue(0);
    mockViol.mockResolvedValue(0);
  });

  test('no pending challans → 15 pts', async () => {
    mockChall.mockResolvedValue(0);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.challans.score).toBe(15);
  });

  test('any pending challan → 0 pts', async () => {
    mockChall.mockResolvedValue(1);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.breakdown.challans.score).toBe(0);
  });
});

describe('Twin Score — labels', () => {
  beforeEach(() => {
    mockDocs.mockResolvedValue([]);
    mockBook.mockResolvedValue(0);
    mockViol.mockResolvedValue(0);
    mockChall.mockResolvedValue(0);
  });

  const labelFor = async (score: number): Promise<string> => {
    // Force all component mocks to produce the desired total
    // Challans: 15 pts (no pending), violations: 20 (no violations), services: 0
    // We adjust docs mock to reach target
    // Only docs (max 45) and challans (15) and violations (20) contribute here → base = 35
    mockChall.mockResolvedValue(0);  // +15
    mockViol.mockResolvedValue(0);   // +20
    mockBook.mockResolvedValue(0);   // +0
    // Target total: 35 + docScore
    // docScore = Math.round(45 * verifiedCount / 3)   [petrol: 3 required]
    // We won't use this helper for the label tests — instead run concrete scenarios:
    return '';
  };

  test('Excellent: total >= 85', async () => {
    // 45 + 20 + 20 + 15 = 100
    mockDocs.mockResolvedValue([
      { type: 'rc', verified: true, expiryDate: FUTURE, status: 'valid' },
      { type: 'insurance', verified: true, expiryDate: FUTURE, status: 'valid' },
      { type: 'puc', verified: true, expiryDate: FUTURE, status: 'valid' }
    ]);
    mockBook.mockResolvedValue(3);
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.label).toBe('Excellent');
  });

  test('Needs Attention: total < 50', async () => {
    mockDocs.mockResolvedValue([]);
    mockBook.mockResolvedValue(0);
    mockViol.mockResolvedValue(4);  // -20 → 0 violation pts
    mockChall.mockResolvedValue(1); // 0 challan pts
    const result = await computeTwinScore(VID, 'petrol');
    expect(result.label).toBe('Needs Attention');
  });
});

// ── Ledger hash chain ─────────────────────────────────────────────────────────

describe('Ledger hash chain', () => {
  const VEH    = 'v1';
  const OWNER1 = 'owner1';
  const OWNER2 = 'owner2';
  const OWNER3 = 'owner3';
  const SNAP   = { score: 75, verifiedDocTypes: ['rc'], completedServiceCount: 1, violationCount: 0, ownershipIndex: 1 };

  let _idCounter = 1;
  const makeTransfer = (from: string, to: string, prevHash: string, at: Date) => {
    const snapshotHash = computeSnapshotHash(SNAP);
    const hash = computeHash(prevHash, VEH, from, to, at, snapshotHash);
    const id   = `fakeid${_idCounter++}`;
    return {
      _id:         { toString: () => id },
      fromOwnerId: { toString: () => from },
      toOwnerId:   { toString: () => to },
      acceptedAt: at,
      hash,
      snapshotHash
    };
  };

  // verifyLedger chains .find().sort(), so the mock must return { sort: () => Promise }
  const mockFindSort = (data: any[]) =>
    mockOTFind.mockReturnValue({ sort: jest.fn().mockResolvedValue(data) });

  test('empty chain → intact = true', async () => {
    mockFindSort([]);
    const result = await verifyLedger(VEH);
    expect(result.intact).toBe(true);
    expect(result.chain).toHaveLength(0);
  });

  test('single transfer with correct hash → intact = true', async () => {
    const at1 = new Date('2023-01-01T00:00:00Z');
    const t1  = makeTransfer(OWNER1, OWNER2, 'GENESIS', at1);
    mockFindSort([t1]);

    const result = await verifyLedger(VEH);
    expect(result.intact).toBe(true);
    expect(result.chain[0].hashValid).toBe(true);
  });

  test('two-link chain with correct hashes → intact = true', async () => {
    const at1 = new Date('2023-01-01T00:00:00Z');
    const at2 = new Date('2024-06-01T00:00:00Z');
    const t1  = makeTransfer(OWNER1, OWNER2, 'GENESIS', at1);
    const t2  = makeTransfer(OWNER2, OWNER3, t1.hash, at2);
    mockFindSort([t1, t2]);

    const result = await verifyLedger(VEH);
    expect(result.intact).toBe(true);
    expect(result.chain).toHaveLength(2);
  });

  test('tampered hash → intact = false', async () => {
    const at1 = new Date('2023-01-01T00:00:00Z');
    const t1  = makeTransfer(OWNER1, OWNER2, 'GENESIS', at1);
    const tampered = { ...t1, hash: 'tampered_hash_value' };
    mockFindSort([tampered]);

    const result = await verifyLedger(VEH);
    expect(result.intact).toBe(false);
    expect(result.chain[0].hashValid).toBe(false);
  });

  test('middle link tampered breaks the rest of the chain', async () => {
    const at1 = new Date('2023-01-01T00:00:00Z');
    const at2 = new Date('2024-06-01T00:00:00Z');
    const t1  = makeTransfer(OWNER1, OWNER2, 'GENESIS', at1);
    const tampered1 = { ...t1, hash: 'tampered' };
    const t2 = makeTransfer(OWNER2, OWNER3, t1.hash, at2); // built on real hash of t1
    mockFindSort([tampered1, t2]);

    const result = await verifyLedger(VEH);
    expect(result.intact).toBe(false);
    expect(result.chain[0].hashValid).toBe(false);
    expect(result.chain[1].hashValid).toBe(false);
  });
});
