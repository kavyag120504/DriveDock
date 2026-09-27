import { Request, Response } from 'express';
import crypto from 'crypto';
import { Vehicle } from '../models/Vehicle';
import { DocumentModel } from '../models/Document';
import { Reminder } from '../models/Reminder';
import { Challan } from '../models/Challan';
import { generateQRToken } from '../services/qrService';

export const createVehicle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { regNumber, type, fuelType, make, model, year, region } = req.body;

    if (!regNumber || !make || !model || !year) {
      res.status(400).json({ success: false, message: 'Registration number, make, model, and year are required' });
      return;
    }

    const cleanedReg = regNumber.toUpperCase().replace(/\s+/g, '');
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
    // If owner, return their own vehicles. If officer/admin/gov, can view all or search
    const query = req.user?.role === 'owner' ? { ownerId: req.user.userId } : {};
    const vehicles = await Vehicle.find(query).sort({ createdAt: -1 });

    // Attach document summary for each vehicle
    const vehicleSummaries = await Promise.all(
      vehicles.map(async (v) => {
        const docs = await DocumentModel.find({ vehicleId: v._id });
        const validVerifiedCount = docs.filter((d) => d.status === 'valid' && d.verified).length;
        const totalDocs = docs.length;
        const pendingChallans = await Challan.countDocuments({ vehicleId: v._id, status: 'pending' });

        return {
          ...v.toObject(),
          documentCount: totalDocs,
          verifiedCount: validVerifiedCount,
          pendingChallans,
          isCompliant: validVerifiedCount >= 4 && docs.every((d) => d.status === 'valid' && d.verified)
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
    const vehicle = await Vehicle.findById(id).populate('ownerId', 'name email phone');

    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    const documents = await DocumentModel.find({ vehicleId: vehicle._id })
      .populate('issuedByProviderId', 'businessName address rating')
      .sort({ expiryDate: 1 });

    const reminders = await Reminder.find({ vehicleId: vehicle._id }).sort({ scheduledFor: 1 });
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
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: id, ownerId: req.user!.userId },
      req.body,
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
    const vehicle = await Vehicle.findOneAndDelete({ _id: id, ownerId: req.user!.userId });

    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
      return;
    }

    await DocumentModel.deleteMany({ vehicleId: id });
    await Reminder.deleteMany({ vehicleId: id });
    await Challan.deleteMany({ vehicleId: id });

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
    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
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
