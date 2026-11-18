import { Request, Response } from 'express';
import crypto from 'crypto';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { Reminder } from '../models/Reminder';
import { Challan } from '../models/Challan';
import { Booking } from '../models/Booking';
import { Violation } from '../models/Violation';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { generateQRToken } from '../services/qrService';
import { normalizeRegNumber, isValidRegNumber, REG_NUMBER_FORMAT_MESSAGE } from '../services/regNumber';
import { ownerScope } from '../services/accessService';
import { isDocumentGood, isVehicleCompliant } from '../services/complianceService';
import { countFound } from '../services/rcParserService';
import { discardUploadedFile } from '../services/uploadService';
import { providers } from '../providers';
import { ENV } from '../config/env';

export const createVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { regNumber, type, fuelType, make, model, year, region } = req.body;

    if (!regNumber || !make || !model || !year) {
      res.status(400).json({ success: false, message: 'Registration number, make, model, and year are required' });
      return;
    }

    const cleanedReg = normalizeRegNumber(String(regNumber));
    if (!isValidRegNumber(cleanedReg)) {
      res.status(400).json({ success: false, code: 'INVALID_REG_NUMBER', message: REG_NUMBER_FORMAT_MESSAGE });
      return;
    }
    const existing = await Vehicle.findOne({ regNumber: cleanedReg });
    if (existing) {
      res.status(409).json({ success: false, message: `Vehicle with registration ${cleanedReg} already exists` });
      return;
    }

    const qrCodeId = `DD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const vehicle = await Vehicle.create({
      ownerId: req.user!.userId,
      regNumber: cleanedReg,
      type: type || 'car',
      fuelType: fuelType || 'petrol',
      make,
      model,
      year: Number(year),
      qrCodeId,
      region: region || { state: 'Maharashtra', district: 'Mumbai' }
    });

    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      data: vehicle
    });
  } catch (error: any) {
    console.error('[VehicleController.createVehicle] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    // Callers only see their own vehicles; admin sees all
    const query = ownerScope(req.user!);
    const vehicles = await Vehicle.find(query).sort({ createdAt: -1 });

    // Attach document summary for each vehicle
    const vehicleSummaries = await Promise.all(
      vehicles.map(async (v) => {
        const docs = await DocumentModel.find({ vehicleId: v._id });
        const validVerifiedCount = docs.filter((d) => isDocumentGood(d)).length;
        const totalDocs = docs.length;
        const pendingChallans = await Challan.countDocuments({ vehicleId: v._id, status: 'pending' });

        return {
          ...v.toObject(),
          documentCount: totalDocs,
          verifiedCount: validVerifiedCount,
          pendingChallans,
          isCompliant: isVehicleCompliant(docs)
        };
      })
    );

    res.status(200).json({ success: true, data: vehicleSummaries });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getVehicleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findOne({ _id: id, ...ownerScope(req.user!) }).populate('ownerId', 'name email phone');

    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const documents = await DocumentModel.find({ vehicleId: vehicle._id })
      .populate('issuedByProviderId', 'businessName address rating')
      .sort({ expiryDate: 1 });

    // Document reminders only: paperwork reminders for a past or current transfer belong to those people
    const reminders = await Reminder.find({ vehicleId: vehicle._id, kind: { $ne: 'transfer' } }).sort({ scheduledFor: 1 });
    const challans = await Challan.find({ vehicleId: vehicle._id }).sort({ issuedAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        vehicle,
        documents,
        reminders,
        challans
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Owners may only change cosmetic fields — never ownerId, regNumber, or qrCodeId
    const ALLOWED_FIELDS = ['type', 'make', 'model', 'year', 'fuelType', 'region'];
    const update: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ success: false, message: 'No updatable fields provided' });
      return;
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: id, ...ownerScope(req.user!) },
      update,
      { new: true }
    );

    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    res.status(200).json({ success: true, data: vehicle });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const found = await Vehicle.findOne({ _id: id, ...ownerScope(req.user!) });

    if (!found) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    // A vehicle's enforcement record belongs to the vehicle, not to its current owner, so it can't be
    // wiped by deleting and re-adding the car. Work in progress can't be orphaned either.
    const [activeBooking, openTransfer, fine, violation] = await Promise.all([
      Booking.exists({ vehicleId: id, status: { $in: ['pending', 'confirmed'] } }),
      // Transfers are never flipped to 'expired', so only those still inside their window count
      OwnershipTransfer.exists({ vehicleId: id, status: { $in: ['pending', 'requested'] }, expiresAt: { $gt: new Date() } }),
      Challan.exists({ vehicleId: id }),
      Violation.exists({ vehicleId: id })
    ]);

    const blockedBy = activeBooking ? 'an active service booking'
      : openTransfer ? 'an ownership transfer in progress'
      : (fine || violation) ? 'e-challan or violation records'
      : null;
    if (blockedBy) {
      res.status(409).json({
        success: false,
        code: 'VEHICLE_IN_USE',
        message: `This vehicle can't be deleted because it has ${blockedBy}.`
      });
      return;
    }

    await Vehicle.deleteOne({ _id: id });
    await DocumentModel.deleteMany({ vehicleId: id });
    await Reminder.deleteMany({ vehicleId: id, kind: { $ne: 'transfer' } });

    res.status(200).json({ success: true, message: 'Vehicle deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CRITICAL TRUST RULE 4: Rotating Time-Bound Signed QR Tokens
 * Owner requests a rotating QR token valid for 2 minutes (120s).
 */
export const getVehicleQRToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findOne({ _id: id, ...ownerScope(req.user!) });

    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    const qrData = generateQRToken(vehicle._id.toString(), vehicle.regNumber);

    res.status(200).json({
      success: true,
      data: {
        token: qrData.token,
        expiresIn: qrData.expiresIn,
        expiresAt: qrData.expiresAt,
        regNumber: vehicle.regNumber,
        qrCodeId: vehicle.qrCodeId
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /vehicles/scan-rc — reads an RC photo and returns Add Vehicle suggestions for the owner
 * to review. Nothing is saved: the image is deleted straight after OCR, no personal data is
 * returned, and OCR failure degrades to empty suggestions (manual entry always still works).
 */
export const scanRc = async (req: Request, res: Response): Promise<void> => {
  const empty = { regNumber: null, make: null, model: null, year: null, fuelType: null, vehicleType: null };
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Take or choose a photo of the RC to scan' });
      return;
    }
    if (req.file.mimetype === 'application/pdf') {
      discardUploadedFile(req.file);
      res.status(200).json({ success: true, data: { ...empty, found: 0, warning: 'PDFs can\'t be scanned. Take a photo of the RC instead.' } });
      return;
    }
    if (!ENV.OCR_SCAN_ENABLED) {
      discardUploadedFile(req.file);
      res.status(200).json({ success: true, data: { ...empty, found: 0, warning: 'RC scanning is turned off right now. Please enter the details manually.' } });
      return;
    }

    const suggestions = await providers.ocr.scanRc(req.file.path);
    discardUploadedFile(req.file);
    const found = countFound(suggestions);
    res.status(200).json({
      success: true,
      data: {
        ...suggestions,
        found,
        warning: found === 0 ? 'Couldn\'t read the RC. Try a sharper photo in good light, or enter the details manually.' : null
      }
    });
  } catch (error: any) {
    console.error('[VehicleController.scanRc] error:', error?.message);
    discardUploadedFile(req.file);
    res.status(200).json({ success: true, data: { ...empty, found: 0, warning: 'Couldn\'t read the RC. Please enter the details manually.' } });
  }
};
