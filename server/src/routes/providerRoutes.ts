import { Router } from 'express';
import {
  getProviders,
  createProvider,
  getMyProviderProfile,
  updateMyProviderProfile,
  getProviderSlots,
  createSlots
} from '../controllers/providerController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createProviderBody, createSlotsBody } from '../validators';

const router = Router();

// Publicly searchable by authenticated users (strictly filtered to status: 'approved' per Trust Rule 3)
router.get('/', authenticate, getProviders);
router.post('/', authenticate, validate({ body: createProviderBody }), createProvider);
router.get('/me', authenticate, getMyProviderProfile);
router.patch('/me', authenticate, authorizeRoles('provider'), updateMyProviderProfile);
router.get('/:id/slots', authenticate, getProviderSlots);
router.post('/:id/slots', authenticate, validate({ body: createSlotsBody }), createSlots);

export default router;
