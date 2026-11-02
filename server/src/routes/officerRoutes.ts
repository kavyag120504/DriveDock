import { Router } from 'express';
import { logViolation, getViolations } from '../controllers/officerController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logViolationBody } from '../validators';

// Violation endpoints, mounted at both /violations and /officer/violations
export const violationRoutes = Router();

violationRoutes.use(authenticate);

violationRoutes.post('/', authorizeRoles('officer', 'admin'), validate({ body: logViolationBody }), logViolation);
violationRoutes.get('/', authorizeRoles('officer', 'admin', 'government'), getViolations);

const router = Router();

router.use('/violations', violationRoutes);

export default router;
