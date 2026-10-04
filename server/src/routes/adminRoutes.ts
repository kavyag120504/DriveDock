import { Router } from 'express';
import {
  createStaffUser,
  getProvidersByAdmin,
  updateProviderStatus,
  getOverviewStats,
  getStatsByRegion,
  getDocumentTrends
} from '../controllers/adminController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Admin-only creation of officer, government and admin accounts
router.post('/users', authorizeRoles('admin'), createStaffUser);

// Admin Provider Gatekeeping (Trust Rule 3)
router.get('/providers', authorizeRoles('admin'), getProvidersByAdmin);
router.patch('/providers/:id/status', authorizeRoles('admin'), updateProviderStatus);

// Government & Admin Analytics Stats
router.get('/stats/overview', authorizeRoles('admin', 'government'), getOverviewStats);
router.get('/stats/by-region', authorizeRoles('admin', 'government'), getStatsByRegion);
router.get('/stats/document-trends', authorizeRoles('admin', 'government'), getDocumentTrends);

export default router;
