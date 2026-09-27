import { Request, Response } from 'express';
import { Provider } from '../models/Provider';
import { Slot } from '../models/Slot';

export const getProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, lat, lng, radius } = req.query;

    // CRITICAL TRUST RULE 3:
    // Providers must be approved by an admin before they can appear in search!
    // Status MUST be 'approved'. Pending or suspended providers are completely invisible in search.
    const filter: Record<string, any> = {
      status: 'approved'
    };

    if (type) {
      filter.serviceTypes = type;
    }

    if (lat && lng) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const maxDistanceMeters = radius ? parseFloat(radius as string) * 1000 : 50000; // default 50km

      filter.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistanceMeters
        }
      };
    }

    const providers = await Provider.find(filter).populate('userId', 'name email phone');
    res.status(200).json({ success: true, count: providers.length, data: providers });
  } catch (error: any) {
    console.error('[ProviderController.getProviders] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { businessName, serviceTypes, coordinates, address, workingHours } = req.body;

    if (!businessName || !coordinates || !address) {
      res.status(400).json({ success: false, message: 'Business name, coordinates, and address are required' });
      return;
    }

    const existing = await Provider.findOne({ userId: req.user!.userId });
    if (existing) {
      res.status(409).json({ success: false, message: 'Provider profile already exists for this user' });
      return;
    }

    // Default status: "pending" (Trust Rule 3 gatekeeping)
    const provider = await Provider.create({
      userId: req.user!.userId,
      businessName,
      serviceTypes: serviceTypes || ['puc', 'fitness', 'insurance'],
      location: {
        type: 'Point',
        coordinates
      },
      address,
      workingHours: workingHours || '09:00 AM - 07:00 PM',
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Provider profile registered. Pending Admin approval before becoming active in search.',
      data: provider
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = await Provider.findOne({ userId: req.user!.userId });
    if (!provider) {
      res.status(404).json({ success: false, message: 'Provider profile not found' });
      return;
    }

    res.status(200).json({ success: true, data: provider });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getProviderSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const query: Record<string, any> = { providerId: id };
    if (date) {
      query.date = date;
    }

    const slots = await Slot.find(query).sort({ date: 1, startTime: 1 });
    res.status(200).json({ success: true, data: slots });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { slots } = req.body; // Array of { date, startTime, endTime }

    if (!Array.isArray(slots) || slots.length === 0) {
      res.status(400).json({ success: false, message: 'Slots array is required' });
      return;
    }

    // Verify requesting user is the provider owner or admin
    const provider = await Provider.findById(id);
    if (!provider) {
      res.status(404).json({ success: false, message: 'Provider not found' });
      return;
    }

    if (req.user?.role !== 'admin' && provider.userId.toString() !== req.user?.userId) {
      res.status(403).json({ success: false, message: 'Forbidden: you cannot manage slots for another provider' });
      return;
    }

    const slotDocs = slots.map((s) => ({
      providerId: provider._id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      isBooked: false
    }));

    const created = await Slot.insertMany(slotDocs);
    res.status(201).json({ success: true, message: `${created.length} slot(s) created`, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
