import { Router } from 'express';
import { logViolation, getViolations } from '../controllers/officerController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/violations', authorizeRoles('officer', 'admin'), logViolation);
router.get('/violations', authorizeRoles('officer', 'admin', 'government'), getViolations);

export default router;
