import { Request, Response } from 'express';
import { Provider } from '../models/Provider';
import { Slot, todayDateString } from '../models/Slot';

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

const ALLOWED_SERVICE_TYPES = ['puc', 'fitness', 'insurance'];
const MAX_CAPACITY = 50;

const parseCapacity = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_CAPACITY ? n : null;
};

const validCoordinates = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length === 2 &&
  typeof c[0] === 'number' && typeof c[1] === 'number' &&
  Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

export const createProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const { businessName, serviceTypes, coordinates, address, workingHours, capacity } = req.body;

    if (!businessName || !coordinates || !address) {
      res.status(400).json({ success: false, message: 'Business name, coordinates, and address are required' });
      return;
    }

    if (capacity !== undefined && parseCapacity(capacity) === null) {
      res.status(400).json({ success: false, message: `capacity must be a whole number from 1 to ${MAX_CAPACITY}` });
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
      capacity: capacity !== undefined ? parseCapacity(capacity) : 1,
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

/**
 * PATCH /providers/me — the provider fills in or edits their centre details.
 * Never touches `status` (only an admin approves a centre).
 */
export const updateMyProviderProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = await Provider.findOne({ userId: req.user!.userId });
    if (!provider) {
      res.status(404).json({ success: false, message: 'Provider profile not found' });
      return;
    }

    const { businessName, serviceTypes, coordinates, address, workingHours, capacity } = req.body;

    if (businessName !== undefined) {
      if (typeof businessName !== 'string' || businessName.trim().length < 2) {
        res.status(400).json({ success: false, message: 'Business name must be at least 2 characters' });
        return;
      }
      provider.businessName = businessName.trim();
    }

    if (serviceTypes !== undefined) {
      if (!Array.isArray(serviceTypes) || serviceTypes.length === 0 ||
          !serviceTypes.every((t) => ALLOWED_SERVICE_TYPES.includes(t))) {
        res.status(400).json({ success: false, message: `serviceTypes must be a non-empty list of: ${ALLOWED_SERVICE_TYPES.join(', ')}` });
        return;
      }
      provider.serviceTypes = [...new Set<string>(serviceTypes)];
    }

    if (coordinates !== undefined) {
      if (!validCoordinates(coordinates)) {
        res.status(400).json({ success: false, message: 'coordinates must be [longitude, latitude]' });
        return;
      }
      provider.location = { type: 'Point', coordinates };
    }

    if (address !== undefined) {
      if (typeof address !== 'string' || address.trim().length < 5) {
        res.status(400).json({ success: false, message: 'Address must be at least 5 characters' });
        return;
      }
      provider.address = address.trim();
    }

    if (workingHours !== undefined) {
      if (typeof workingHours !== 'string' || !workingHours.trim()) {
        res.status(400).json({ success: false, message: 'workingHours cannot be empty' });
        return;
      }
      provider.workingHours = workingHours.trim();
    }

    if (capacity !== undefined) {
      const parsed = parseCapacity(capacity);
      if (parsed === null) {
        res.status(400).json({ success: false, message: `capacity must be a whole number from 1 to ${MAX_CAPACITY}` });
        return;
      }
      provider.capacity = parsed;
    }

    provider.profileCompleted = true;
    await provider.save();

    res.status(200).json({ success: true, message: 'Centre profile saved', data: provider });
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

    // Owners booking a renewal only see slots from today onwards; the station itself
    // (and admin) still sees its full slot history
    const provider = await Provider.findById(id).select('userId');
    const isStationOrAdmin = req.user?.role === 'admin' || provider?.userId.toString() === req.user?.userId;
    if (!isStationOrAdmin) {
      query.date = date && date >= todayDateString() ? date : { $gte: todayDateString() };
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

    // Each slot's capacity defaults to the centre's bay count; a slot may override it
    const today = todayDateString();
    const slotDocs = [];
    for (const s of slots) {
      if (typeof s?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || isNaN(new Date(s.date).getTime())) {
        res.status(400).json({ success: false, message: 'Each slot needs a date in YYYY-MM-DD format' });
        return;
      }
      if (s.date < today) {
        res.status(400).json({ success: false, message: `Cannot create slots for a past date (${s.date})` });
        return;
      }
      if (typeof s.startTime !== 'string' || !s.startTime.trim() || typeof s.endTime !== 'string' || !s.endTime.trim()) {
        res.status(400).json({ success: false, message: 'Each slot needs a startTime and endTime' });
        return;
      }

      const slotCapacity = s.capacity === undefined ? provider.capacity : parseCapacity(s.capacity);
      if (slotCapacity === null) {
        res.status(400).json({ success: false, message: `capacity must be a whole number from 1 to ${MAX_CAPACITY}` });
        return;
      }
      slotDocs.push({
        providerId: provider._id,
        date: s.date,
        startTime: s.startTime.trim(),
        endTime: s.endTime.trim(),
        capacity: slotCapacity,
        bookedCount: 0,
        isBooked: false
      });
    }

    // A time window that already exists is skipped, so pressing "Create" twice can't silently
    // double a centre's capacity (to add more bays to a window, raise the centre's bay count instead)
    const existing = await Slot.find({ providerId: provider._id, date: { $in: slotDocs.map((d) => d.date) } })
      .select('date startTime');
    const taken = new Set(existing.map((e) => `${e.date}|${e.startTime}`));
    const fresh = slotDocs.filter((d) => {
      const key = `${d.date}|${d.startTime}`;
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    });
    const skipped = slotDocs.length - fresh.length;

    if (fresh.length === 0) {
      res.status(409).json({
        success: false,
        code: 'SLOTS_EXIST',
        message: slotDocs.length === 1 ? 'That slot already exists.' : 'Those slots already exist for that date.'
      });
      return;
    }

    const created = await Slot.insertMany(fresh);
    res.status(201).json({
      success: true,
      message: skipped > 0
        ? `${created.length} slot(s) created, ${skipped} already existed and were skipped`
        : `${created.length} slot(s) created`,
      data: created,
      skipped
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
