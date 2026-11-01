import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Violation } from '../models/Violation';
import { Challan } from '../models/Challan';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { isDocumentGood } from '../services/complianceService';
import { recordAudit } from '../services/auditLog';

const PENALTY_MAP: Record<string, number> = {
  puc: 1000,
  insurance: 2000,
  rc: 5000,
  fitness: 3000,
  license: 1500
};

export const logViolation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId, documentTypeExpired, location, notes } = req.body;

    if (!vehicleId || !documentTypeExpired || typeof location !== 'string' || !location.trim()) {
      res.status(400).json({ success: false, message: 'vehicleId, documentTypeExpired, and location are required' });
      return;
    }

    if (!mongoose.isValidObjectId(vehicleId)) {
      res.status(400).json({ success: false, message: 'vehicleId is not valid' });
      return;
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    // Only the five known document types can be cited (the app may send them in capitals)
    const cited: unknown[] = Array.isArray(documentTypeExpired) ? documentTypeExpired : [documentTypeExpired];
    const expiredTypes = [...new Set(cited.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : '')))];
    const unknown = expiredTypes.filter((t) => !(t in PENALTY_MAP));
    if (expiredTypes.length === 0 || unknown.length > 0) {
      res.status(400).json({
        success: false,
        message: `documentTypeExpired must list one or more of: ${Object.keys(PENALTY_MAP).join(', ')}`
      });
      return;
    }

    // A document that is verified, valid and unexpired is not a violation, so it can't be cited
    const docs = await DocumentModel.find({ vehicleId: vehicle._id, type: { $in: expiredTypes } });
    const fine = expiredTypes.filter((t) => docs.some((d) => d.type === t && isDocumentGood(d)));
    if (fine.length > 0) {
      res.status(400).json({
        success: false,
        message: `${fine.map((t) => t.toUpperCase()).join(', ')} ${fine.length > 1 ? 'are' : 'is'} verified and valid on this vehicle, so ${fine.length > 1 ? 'they' : 'it'} can't be cited.`
      });
      return;
    }

    // Penalty is always computed server-side from the fee table; client input is ignored
    let totalPenalty = 0;
    for (const type of expiredTypes) {
      totalPenalty += PENALTY_MAP[type];
    }

    // Create Challan automatically
    const challan = await Challan.create({
      vehicleId,
      amount: totalPenalty,
      reason: `Non-compliance violation: ${expiredTypes.join(', ').toUpperCase()} invalid or unverified`,
      status: 'pending',
      issuedAt: new Date()
    });

    // Create Violation record linked to officer and challan
    const violation = await Violation.create({
      vehicleId,
      officerId: req.user!.userId,
      documentTypeExpired: expiredTypes,
      location: location.trim(),
      notes: typeof notes === 'string' ? notes : '',
      challanId: challan._id
    });

    // Append-only audit of the officer action (ids/flags only, never owner PII).
    await recordAudit({
      actorId: req.user!.userId,
      actorRole: 'officer',
      action: 'officer_violation_logged',
      entityType: 'vehicle',
      entityId: vehicleId,
      fields: expiredTypes,
      metadata: { challanId: String(challan._id), amount: totalPenalty },
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Violation recorded and digital e-Challan issued to vehicle owner',
      data: {
        violation,
        challan
      }
    });
  } catch (error: any) {
    console.error('[OfficerController.logViolation] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getViolations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.query;
    const query: Record<string, any> = {};

    if (vehicleId) {
      query.vehicleId = vehicleId;
    }

    const violations = await Violation.find(query)
      .populate('vehicleId', 'regNumber make model fuelType region')
      .populate('officerId', 'name email phone')
      .populate('challanId')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: violations.length, data: violations });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
