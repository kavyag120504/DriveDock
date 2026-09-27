import { Request, Response } from 'express';
import { Violation } from '../models/Violation';
import { Challan } from '../models/Challan';
import { Vehicle } from '../models/Vehicle';

const PENALTY_MAP: Record<string, number> = {
  puc: 1000,
  insurance: 2000,
  rc: 5000,
  fitness: 3000,
  license: 1500
};

export const logViolation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId, documentTypeExpired, location, notes, penaltyAmount } = req.body;

    if (!vehicleId || !documentTypeExpired || !location) {
      res.status(400).json({ success: false, message: 'vehicleId, documentTypeExpired, and location are required' });
      return;
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    const expiredTypes: string[] = Array.isArray(documentTypeExpired)
      ? documentTypeExpired
      : [documentTypeExpired];

    // Calculate penalty based on offenses or custom override
    let totalPenalty = penaltyAmount ? Number(penaltyAmount) : 0;
    if (!penaltyAmount) {
      for (const type of expiredTypes) {
        totalPenalty += PENALTY_MAP[type.toLowerCase()] || 1000;
      }
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
      location,
      notes: notes || '',
      challanId: challan._id
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
