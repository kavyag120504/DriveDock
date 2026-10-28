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

const router = Router();

// Publicly searchable by authenticated users (strictly filtered to status: 'approved' per Trust Rule 3)
router.get('/', authenticate, getProviders);
router.post('/', authenticate, createProvider);
router.get('/me', authenticate, getMyProviderProfile);
router.patch('/me', authenticate, authorizeRoles('provider'), updateMyProviderProfile);
router.get('/:id/slots', authenticate, getProviderSlots);
router.post('/:id/slots', authenticate, createSlots);

export default router;
