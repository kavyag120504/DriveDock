import { Router } from 'express';
import {
  getProviders,
  createProvider,
  getMyProviderProfile,
  getProviderSlots,
  createSlots
} from '../controllers/providerController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Publicly searchable by authenticated users (strictly filtered to status: 'approved' per Trust Rule 3)
router.get('/', authenticate, getProviders);
router.post('/', authenticate, createProvider);
router.get('/me', authenticate, getMyProviderProfile);
router.get('/:id/slots', authenticate, getProviderSlots);
router.post('/:id/slots', authenticate, createSlots);

export default router;
