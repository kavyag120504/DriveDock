import { Request, Response } from 'express';
import { Provider } from '../models/Provider';
import { Slot } from '../models/Slot';

/**
 * GET /api/v1/stations
 * Returns approved providers sorted by geo-proximity.
 * Uses MongoDB 2dsphere $nearSphere for real distance queries.
 */
export const getNearbyStations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { lat, lng, radius = '25', type } = req.query;

    // TRUST RULE 3: Only approved providers appear in station search
    const filter: Record<string, any> = { status: 'approved' };

    if (type && type !== 'all') {
      filter.serviceTypes = { $in: [type] };
    }

    if (lat && lng) {
      const latitude  = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const maxDist   = parseFloat(radius as string) * 1000; // km -> meters

      filter.location = {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: maxDist
        }
      };
    }

    const stations = await Provider.find(filter)
      .populate('userId', 'name phone')
      .limit(30)
      .lean();

    // Compute distance in km if coords given
    const withDistance = stations.map((s: any) => {
      let distanceKm: number | null = null;
      if (lat && lng) {
        const [sLng, sLat] = s.location.coordinates;
        const dLat = (parseFloat(lat as string) - sLat) * (Math.PI / 180);
        const dLng = (parseFloat(lng as string) - sLng) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(sLat * (Math.PI / 180)) * Math.cos(parseFloat(lat as string) * (Math.PI / 180)) *
          Math.sin(dLng / 2) ** 2;
        distanceKm = parseFloat((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
      }
      return { ...s, distanceKm };
    });

    res.status(200).json({ success: true, count: withDistance.length, data: withDistance });
  } catch (error: any) {
    console.error('[StationController.getNearbyStations]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/stations/:id
 * Full station detail with contact, services, rating, hours
 */
export const getStationDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const station = await Provider.findById(id).populate('userId', 'name phone email');
    if (!station) {
      res.status(404).json({ success: false, message: 'Station not found' });
      return;
    }
    if (station.status !== 'approved') {
      res.status(403).json({ success: false, message: 'Station not approved' });
      return;
    }
    res.status(200).json({ success: true, data: station });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/stations/:id/slots?date=YYYY-MM-DD
 * Available (un-booked) slots for a specific date
 */
export const getStationSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    const query: Record<string, any> = { providerId: id, isBooked: false };
    if (date) query.date = date;

    const slots = await Slot.find(query).sort({ date: 1, startTime: 1 });
    res.status(200).json({ success: true, count: slots.length, data: slots });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
