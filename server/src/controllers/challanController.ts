import { Request, Response } from 'express';
import { Challan } from '../models/Challan';
import { Vehicle } from '../models/Vehicle';

export const getVehicleChallans = async (req: Request, res: Response): Promise<void> => {
  try {
    const { vehicleId } = req.params;

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    const challans = await Challan.find({ vehicleId }).sort({ issuedAt: -1 });

    res.status(200).json({
      success: true,
      count: challans.length,
      data: challans,
      summary: {
        totalAmount: challans.reduce((sum, c) => sum + c.amount, 0),
        pendingAmount: challans.filter((c) => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0),
        pendingCount: challans.filter((c) => c.status === 'pending').length
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const payChallan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const challan = await Challan.findById(id);
    if (!challan) {
      res.status(404).json({ success: false, message: 'Challan not found' });
      return;
    }

    if (challan.status === 'paid') {
      res.status(400).json({ success: false, message: 'Challan has already been paid' });
      return;
    }

    challan.status = 'paid';
    challan.paidAt = new Date();
    await challan.save();

    res.status(200).json({
      success: true,
      message: `Challan of ₹${challan.amount} paid successfully. Digital receipt generated.`,
      data: challan
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
