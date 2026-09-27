import { Router } from 'express';
import { verifyVehicleQR } from '../controllers/verificationController';

const router = Router();

// Public endpoint for Officer & enforcement QR scans (Trust Rule 2 & 4)
router.get('/verify', verifyVehicleQR);

export default router;
