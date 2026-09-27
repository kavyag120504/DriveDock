import { Request, Response } from 'express';
import { verifyQRToken } from '../services/qrService';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { Challan } from '../models/Challan';

const REQUIRED_DOCUMENTS = ['rc', 'insurance', 'puc', 'license', 'fitness'] as const;

/**
 * CRITICAL TRUST RULE 2 & RULE 4:
 * Public verification endpoint for Officer QR scans.
 * 1. Verifies 2-minute time-bound rotating cryptographic token.
 * 2. Strict compliance evaluation:
 *    - Returns "GREEN" IF AND ONLY IF all 5 required documents exist, have status="valid", AND verified=true.
 *    - Any document that is unverified (owner-uploaded), missing, or expired forces compliance to "RED".
 */
export const verifyVehicleQR = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        valid: false,
        compliance: 'RED',
        error: 'QR verification token is missing'
      });
      return;
    }

    // Step 1: Verify token signature and 2-minute expiration
    const tokenCheck = verifyQRToken(token);
    if (!tokenCheck.valid || !tokenCheck.payload) {
      res.status(401).json({
        success: false,
        valid: false,
        compliance: 'RED',
        error: tokenCheck.error || 'QR Token is invalid or expired (> 2 minutes). Refresh QR code.'
      });
      return;
    }

    const { vehicleId } = tokenCheck.payload;
    const vehicle = await Vehicle.findById(vehicleId).populate('ownerId', 'name phone');

    if (!vehicle) {
      res.status(404).json({
        success: false,
        valid: false,
        compliance: 'RED',
        error: 'Vehicle not found in National Registry'
      });
      return;
    }

    // Fetch all documents for this vehicle
    const documents = await DocumentModel.find({ vehicleId: vehicle._id })
      .populate('issuedByProviderId', 'businessName address rating');

    const pendingChallans = await Challan.find({ vehicleId: vehicle._id, status: 'pending' });

    // Step 2: Evaluate Compliance strictly against Trust Rules
    const docMap = new Map<string, typeof documents[0]>();
    for (const doc of documents) {
      docMap.set(doc.type, doc);
    }

    const missingDocs: string[] = [];
    const unverifiedDocs: string[] = [];
    const expiredDocs: string[] = [];

    for (const reqType of REQUIRED_DOCUMENTS) {
      const doc = docMap.get(reqType);
      if (!doc) {
        missingDocs.push(reqType.toUpperCase());
        continue;
      }

      if (doc.status === 'expired' || new Date(doc.expiryDate).getTime() < Date.now()) {
        expiredDocs.push(reqType.toUpperCase());
      } else if (!doc.verified) {
        // Owner uploaded photo for personal tracking but provider never verified it
        unverifiedDocs.push(reqType.toUpperCase());
      }
    }

    const isFullyCompliant = missingDocs.length === 0 && unverifiedDocs.length === 0 && expiredDocs.length === 0;

    let failureReasons: string[] = [];
    if (unverifiedDocs.length > 0) {
      failureReasons.push(`Unverified documents (not certified by approved provider): ${unverifiedDocs.join(', ')}`);
    }
    if (expiredDocs.length > 0) {
      failureReasons.push(`Expired documents: ${expiredDocs.join(', ')}`);
    }
    if (missingDocs.length > 0) {
      failureReasons.push(`Missing documents: ${missingDocs.join(', ')}`);
    }

    const compliance = isFullyCompliant ? 'GREEN' : 'RED';
    const reason = isFullyCompliant
      ? 'All required documents verified genuine and valid by approved providers.'
      : failureReasons.join(' | ');

    res.status(200).json({
      success: true,
      valid: true,
      compliance,
      reason,
      data: {
        vehicle: {
          id: vehicle._id,
          regNumber: vehicle.regNumber,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          fuelType: vehicle.fuelType,
          region: vehicle.region,
          owner: vehicle.ownerId
        },
        compliance,
        isFullyCompliant,
        issues: {
          unverifiedDocs,
          expiredDocs,
          missingDocs
        },
        documents: documents.map((d) => ({
          id: d._id,
          type: d.type,
          status: d.status,
          verified: d.verified,
          issueDate: d.issueDate,
          expiryDate: d.expiryDate,
          fileUrl: d.fileUrl,
          issuedBy: d.issuedByProviderId
        })),
        pendingChallans: pendingChallans.length,
        totalChallanAmount: pendingChallans.reduce((acc, c) => acc + c.amount, 0),
        scannedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[VerificationController.verifyVehicleQR] error:', error);
    res.status(500).json({ success: false, compliance: 'RED', error: error.message });
  }
};
