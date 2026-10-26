import { Request, Response } from 'express';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { Booking } from '../models/Booking';
import { Challan } from '../models/Challan';
import { Reminder } from '../models/Reminder';
import { Violation } from '../models/Violation';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { TwinShare } from '../models/TwinShare';
import {
  generateTransferToken, verifyTransferToken,
  generateShareToken, verifyShareToken,
  computeSnapshotHash, computeHash, verifyLedger
} from '../services/transfer.service';
import { computeTwinScore } from '../services/twinScore.service';
import { buildTimeline } from '../services/twinTimeline.service';
import { isDocumentGood } from '../services/complianceService';

// ── Helper ────────────────────────────────────────────────────────────────────

const maskRegNumber = (reg: string): string => {
  if (reg.length <= 6) return '••••••';
  return reg.slice(0, 4) + '••••' + reg.slice(-2);
};

// ── POST /twin/transfers ──────────────────────────────────────────────────────

export const createTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.body;
    const callerId = req.user!.userId;

    if (!vehicleId) {
      res.status(400).json({ success: false, message: 'vehicleId is required' });
      return;
    }

    const vehicle = await Vehicle.findOne({ _id: vehicleId, ownerId: callerId });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const activeBooking = await Booking.findOne({ vehicleId, status: { $in: ['pending', 'confirmed'] } });
    if (activeBooking) {
      res.status(400).json({ success: false, message: 'Cannot initiate transfer: vehicle has active bookings' });
      return;
    }

    const pendingChallan = await Challan.findOne({ vehicleId, status: 'pending' });
    if (pendingChallan) {
      res.status(400).json({ success: false, message: 'Cannot initiate transfer: vehicle has pending challans' });
      return;
    }

    // Cancel any existing pending transfer for this vehicle before creating a new one
    await OwnershipTransfer.updateMany(
      { vehicleId, status: { $in: ['pending', 'requested'] } },
      { $set: { status: 'cancelled' } }
    );

    // Build snapshot
    const scoreData = await computeTwinScore(vehicleId, vehicle.fuelType);
    const docs = await DocumentModel.find({ vehicleId });
    const now = Date.now();
    const verifiedDocTypes = docs
      .filter((d) => isDocumentGood(d, now))
      .map((d) => d.type);
    const completedServiceCount = await Booking.countDocuments({ vehicleId, status: 'completed' });
    const violationCount = await Violation.countDocuments({ vehicleId });
    const ownershipIndex = (await OwnershipTransfer.countDocuments({ vehicleId, status: 'accepted' })) + 1;

    const snapshot = {
      score: scoreData.total,
      verifiedDocTypes,
      completedServiceCount,
      violationCount,
      ownershipIndex
    };
    const snapshotHash = computeSnapshotHash(snapshot);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const transfer = await OwnershipTransfer.create({
      vehicleId,
      fromOwnerId: callerId,
      toOwnerId: null,
      status: 'pending',
      expiresAt,
      snapshot,
      snapshotHash,
      prevHash: '',
      hash: ''
    });

    const token = generateTransferToken(transfer._id!.toString());

    res.status(201).json({
      success: true,
      data: { transferId: transfer._id, token, expiresAt }
    });
  } catch (err: any) {
    console.error('[TwinController.createTransfer]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /twin/transfers/preview?token= ────────────────────────────────────────

export const previewTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'token query param is required' });
      return;
    }

    let transferId: string;
    try {
      transferId = verifyTransferToken(token).transferId;
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired transfer token' });
      return;
    }

    const transfer = await OwnershipTransfer.findOne({
      _id: transferId,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });
    if (!transfer) {
      res.status(410).json({ success: false, message: 'Transfer has expired or been processed' });
      return;
    }

    const vehicle = await Vehicle.findById(transfer.vehicleId);
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    const score = await computeTwinScore(vehicle._id!.toString(), vehicle.fuelType);
    const docs = await DocumentModel.find({ vehicleId: vehicle._id });
    const nowMs = Date.now();

    const docDetails = docs.map((d) => ({
      type: d.type,
      verified: d.verified,
      status: d.status,
      expiryDate: d.expiryDate,
      isGood: isDocumentGood(d, nowMs)
    }));

    // SAFE: no seller name, phone, email, or address returned
    res.status(200).json({
      success: true,
      data: {
        vehicle: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          regNumber: maskRegNumber(vehicle.regNumber),
          fuelType: vehicle.fuelType,
          type: vehicle.type,
          region: vehicle.region
        },
        twinScore: score.total,
        twinScoreLabel: score.label,
        scoreBreakdown: score.breakdown,
        verifiedDocTypes: transfer.snapshot.verifiedDocTypes,
        documents: docDetails,
        completedServiceCount: transfer.snapshot.completedServiceCount,
        ownershipCount: transfer.snapshot.ownershipIndex,
        expiresAt: transfer.expiresAt
      }
    });
  } catch (err: any) {
    console.error('[TwinController.previewTransfer]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /twin/transfers/accept ───────────────────────────────────────────────

/** How long the seller has to approve once a buyer has applied. */
const APPROVAL_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * BUYER: applies to take ownership by sending the token from the seller's transfer QR.
 * Nothing changes hands yet; the seller must approve (approveTransfer).
 */
export const requestTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    const buyerId = req.user!.userId;

    if (!token) {
      res.status(400).json({ success: false, message: 'token is required' });
      return;
    }

    let transferId: string;
    try {
      transferId = verifyTransferToken(token).transferId;
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired transfer token' });
      return;
    }

    if (req.user!.role !== 'owner') {
      res.status(403).json({ success: false, message: 'Only owners can apply for a vehicle transfer' });
      return;
    }

    const existing = await OwnershipTransfer.findById(transferId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Transfer not found' });
      return;
    }
    if (existing.fromOwnerId.toString() === buyerId) {
      res.status(400).json({ success: false, message: 'Cannot transfer a vehicle to yourself' });
      return;
    }

    const now = new Date();
    // ATOMIC: only one buyer can apply on a given transfer QR
    const transfer = await OwnershipTransfer.findOneAndUpdate(
      { _id: transferId, status: 'pending', expiresAt: { $gt: now } },
      { $set: { status: 'requested', toOwnerId: buyerId, requestedAt: now, expiresAt: new Date(now.getTime() + APPROVAL_WINDOW_MS) } },
      { new: true }
    );

    if (!transfer) {
      const latest = await OwnershipTransfer.findById(transferId);
      if (latest?.status === 'requested' && latest.toOwnerId?.toString() === buyerId) {
        res.status(200).json({ success: true, message: 'You have already applied. Waiting for the seller to approve.', data: { transferId, status: 'requested' } });
      } else if (latest?.status === 'requested') {
        res.status(409).json({ success: false, message: 'Another buyer has already applied for this vehicle', code: 'ALREADY_REQUESTED' });
      } else if (!latest || (latest.status === 'pending' && latest.expiresAt <= now)) {
        res.status(410).json({ success: false, message: 'Transfer has expired', code: 'EXPIRED' });
      } else {
        res.status(409).json({ success: false, message: 'Transfer already processed or cancelled', code: 'ALREADY_PROCESSED' });
      }
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Request sent. The seller must approve it before the vehicle is transferred.',
      data: { transferId: transfer._id, status: transfer.status }
    });
  } catch (err: any) {
    console.error('[TwinController.requestTransfer]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * SELLER: approves a buyer's request. Only now does ownership move: the vehicle leaves the
 * seller's passport and appears in the buyer's.
 */
export const approveTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sellerId = req.user!.userId;
    const now = new Date();

    const current = await OwnershipTransfer.findOne({ _id: id, fromOwnerId: sellerId });
    if (!current) {
      res.status(404).json({ success: false, message: 'Transfer not found or unauthorized' });
      return;
    }
    if (current.status !== 'requested') {
      res.status(409).json({ success: false, message: `No buyer request to approve (transfer is ${current.status})`, code: 'NOT_REQUESTED' });
      return;
    }
    if (current.expiresAt <= now) {
      res.status(410).json({ success: false, message: 'The buyer request has expired', code: 'EXPIRED' });
      return;
    }

    // The vehicle must still be clean at the moment of handover
    const activeBooking = await Booking.findOne({ vehicleId: current.vehicleId, status: { $in: ['pending', 'confirmed'] } });
    if (activeBooking) {
      res.status(400).json({ success: false, message: 'Cannot complete transfer: vehicle has active bookings' });
      return;
    }
    const pendingChallan = await Challan.findOne({ vehicleId: current.vehicleId, status: 'pending' });
    if (pendingChallan) {
      res.status(400).json({ success: false, message: 'Cannot complete transfer: vehicle has pending challans' });
      return;
    }

    // ── ATOMIC CLAIM ─────────────────────────────────────────────────────────
    const transfer = await OwnershipTransfer.findOneAndUpdate(
      { _id: id, fromOwnerId: sellerId, status: 'requested', expiresAt: { $gt: now } },
      { $set: { status: 'accepted' } },
      { new: true }
    );
    if (!transfer || !transfer.toOwnerId) {
      res.status(409).json({ success: false, message: 'Transfer already processed', code: 'ALREADY_PROCESSED' });
      return;
    }
    const buyerId = transfer.toOwnerId.toString();

    // ── CONDITIONAL VEHICLE UPDATE ────────────────────────────────────────────
    const updatedVehicle = await Vehicle.findOneAndUpdate(
      { _id: transfer.vehicleId, ownerId: transfer.fromOwnerId },
      { $set: { ownerId: buyerId } }
    );
    if (!updatedVehicle) {
      // Compensating rollback: put the request back so it can be retried
      await OwnershipTransfer.findByIdAndUpdate(id, { $set: { status: 'requested' } });
      res.status(409).json({ success: false, message: 'Vehicle ownership changed during transfer; please try again' });
      return;
    }

    // ── SIDE EFFECTS ─────────────────────────────────────────────────────────
    // Reassign unsent reminders to the buyer so they receive future expiry alerts
    await Reminder.updateMany(
      { vehicleId: transfer.vehicleId, sent: false },
      { $set: { ownerId: buyerId } }
    );

    // Revoke all active share links for this vehicle
    await TwinShare.updateMany(
      { vehicleId: transfer.vehicleId },
      { $set: { revoked: true } }
    );

    // ── LEDGER HASH CHAIN ─────────────────────────────────────────────────────
    const prevTransfer = await OwnershipTransfer.findOne(
      { vehicleId: transfer.vehicleId, status: 'accepted', _id: { $ne: id } },
      {},
      { sort: { acceptedAt: -1 } }
    );
    const prevHash = prevTransfer?.hash || 'GENESIS';
    const acceptedAt = new Date();
    const hash = computeHash(
      prevHash,
      transfer.vehicleId.toString(),
      transfer.fromOwnerId.toString(),
      buyerId,
      acceptedAt,
      transfer.snapshotHash
    );

    await OwnershipTransfer.findByIdAndUpdate(id, {
      $set: { prevHash, hash, acceptedAt }
    });

    res.status(200).json({ success: true, message: 'Vehicle transferred successfully', data: { vehicleId: transfer.vehicleId } });
  } catch (err: any) {
    console.error('[TwinController.approveTransfer]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/** SELLER: declines a buyer's request. The vehicle stays with the seller. */
export const rejectTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const transfer = await OwnershipTransfer.findOneAndUpdate(
      { _id: req.params.id, fromOwnerId: req.user!.userId, status: 'requested' },
      { $set: { status: 'rejected', rejectedAt: new Date() } },
      { new: true }
    );
    if (!transfer) {
      res.status(404).json({ success: false, message: 'No buyer request to decline' });
      return;
    }
    res.status(200).json({ success: true, message: 'Request declined. The vehicle stays with you.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const cancelTransfer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const callerId = req.user!.userId;

    const transfer = await OwnershipTransfer.findOneAndUpdate(
      { _id: id, fromOwnerId: callerId, status: { $in: ['pending', 'requested'] } },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!transfer) {
      res.status(404).json({ success: false, message: 'Pending transfer not found or unauthorized' });
      return;
    }

    res.status(200).json({ success: true, message: 'Transfer cancelled' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /twin/transfers ───────────────────────────────────────────────────────

export const listTransfers = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const transfers = await OwnershipTransfer.find({
      $or: [{ fromOwnerId: userId }, { toOwnerId: userId }]
    })
      .sort({ createdAt: -1 })
      .populate('vehicleId', 'regNumber make model year')
      .populate('toOwnerId', 'name');

    // The seller sees who applied (name only); the buyer never sees the seller's identity,
    // and sees the full plate only once the vehicle is theirs
    const data = transfers.map((t: any) => {
      const isSeller = t.fromOwnerId.toString() === userId;
      const v = t.vehicleId;
      return {
        _id: t._id,
        role: isSeller ? 'seller' : 'buyer',
        status: t.status,
        vehicleId: v?._id ?? null,
        vehicle: v
          ? { make: v.make, model: v.model, year: v.year, regNumber: isSeller || t.status === 'accepted' ? v.regNumber : maskRegNumber(v.regNumber) }
          : null,
        buyerName: isSeller ? t.toOwnerId?.name ?? null : undefined,
        createdAt: t.createdAt,
        requestedAt: t.requestedAt,
        acceptedAt: t.acceptedAt,
        rejectedAt: t.rejectedAt,
        expiresAt: t.expiresAt
      };
    });

    res.status(200).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── GET /twin/vehicles/:id/timeline ──────────────────────────────────────────

export const getTimeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const callerId = req.user!.userId;

    const vehicle = await Vehicle.findOne({ _id: id, ownerId: callerId });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const timeline = await buildTimeline(id);
    res.status(200).json({ success: true, data: timeline });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /twin/vehicles/:id/score ──────────────────────────────────────────────

export const getScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const callerId = req.user!.userId;

    const vehicle = await Vehicle.findOne({ _id: id, ownerId: callerId });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const score = await computeTwinScore(id, vehicle.fuelType);

    // Include ownership chain for the UI
    const transfers = await OwnershipTransfer.find(
      { vehicleId: id, status: 'accepted' },
      { fromOwnerId: 1, toOwnerId: 1, acceptedAt: 1, snapshot: 1 },
      { sort: { acceptedAt: 1 } }
    );
    const ownershipChain = transfers.map((t, i) => ({
      label: `Owner ${i + 1}`,
      acceptedAt: t.acceptedAt,
      scoreAtTransfer: t.snapshot.score
    }));
    ownershipChain.push({ label: 'You', acceptedAt: null, scoreAtTransfer: score.total });

    const { intact } = await verifyLedger(id);

    res.status(200).json({
      success: true,
      data: { ...score, ownershipChain, ledgerIntact: intact }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /twin/vehicles/:id/share ─────────────────────────────────────────────

export const createShare = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const callerId = req.user!.userId;

    const vehicle = await Vehicle.findOne({ _id: id, ownerId: callerId });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const share = await TwinShare.create({ vehicleId: id, createdBy: callerId, expiresAt, revoked: false });

    const token = generateShareToken(share._id!.toString(), id);

    res.status(201).json({ success: true, data: { shareId: share._id, token, expiresAt } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DELETE /twin/shares/:id ───────────────────────────────────────────────────

export const revokeShare = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const callerId = req.user!.userId;

    const share = await TwinShare.findOneAndUpdate(
      { _id: id, createdBy: callerId },
      { $set: { revoked: true } },
      { new: true }
    );
    if (!share) {
      res.status(404).json({ success: false, message: 'Share not found or unauthorized' });
      return;
    }

    res.status(200).json({ success: true, message: 'Share revoked' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /twin/vehicles/:id/shares ─────────────────────────────────────────────

export const listShares = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const callerId = req.user!.userId;

    const vehicle = await Vehicle.findOne({ _id: id, ownerId: callerId });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const shares = await TwinShare.find({ vehicleId: id, createdBy: callerId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: shares });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /public/twin?token= (no auth) ────────────────────────────────────────

export const publicTwinView = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'token query param is required' });
      return;
    }

    let shareId: string, vehicleId: string;
    try {
      const payload = verifyShareToken(token);
      shareId = payload.shareId;
      vehicleId = payload.vehicleId;
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired share token' });
      return;
    }

    const share = await TwinShare.findOne({ _id: shareId, revoked: false, expiresAt: { $gt: new Date() } });
    if (!share) {
      res.status(410).json({ success: false, message: 'Share link has expired or been revoked' });
      return;
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    const score = await computeTwinScore(vehicleId, vehicle.fuelType);
    const completedServiceCount = await Booking.countDocuments({ vehicleId, status: 'completed' });
    const ownershipCount = (await OwnershipTransfer.countDocuments({ vehicleId, status: 'accepted' })) + 1;

    // SAFE: no owner name, phone, email, or address
    res.status(200).json({
      success: true,
      data: {
        vehicle: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          regNumber: maskRegNumber(vehicle.regNumber),
          fuelType: vehicle.fuelType,
          type: vehicle.type,
          region: vehicle.region
        },
        twinScore: score.total,
        twinScoreLabel: score.label,
        scoreBreakdown: score.breakdown,
        completedServiceCount,
        ownershipCount
      }
    });
  } catch (err: any) {
    console.error('[TwinController.publicTwinView]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
