import { objectIdParams } from '../middleware/objectIdParam';
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getNearbyStations, getStationDetail, getStationSlots } from '../controllers/stationController';

const router = Router();
objectIdParams(router, ['id']);

// GET /api/v1/stations?lat=&lng=&radius=&type=
router.get('/', authenticate, getNearbyStations);

// GET /api/v1/stations/:id
router.get('/:id', authenticate, getStationDetail);

// GET /api/v1/stations/:id/slots?date=YYYY-MM-DD
router.get('/:id/slots', authenticate, getStationSlots);

export default router;
