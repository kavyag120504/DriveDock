import { Router } from 'express';
import { logViolation, getViolations } from '../controllers/officerController';
import { authenticate, authorizeRoles } from '../middleware/auth';

// Violation endpoints, mounted at both /violations and /officer/violations
export const violationRoutes = Router();

violationRoutes.use(authenticate);

violationRoutes.post('/', authorizeRoles('officer', 'admin'), logViolation);
violationRoutes.get('/', authorizeRoles('officer', 'admin', 'government'), getViolations);

const router = Router();

router.use('/violations', violationRoutes);

export default router;
