import { objectIdParams } from '../middleware/objectIdParam';
import { Router } from 'express';
import { getVehicleChallans, payChallan } from '../controllers/challanController';
import { authenticate } from '../middleware/auth';

const router = Router();
objectIdParams(router, ['id', 'vehicleId']);

router.use(authenticate);

router.get('/:vehicleId', getVehicleChallans);
router.patch('/:id/pay', payChallan);

export default router;
