import { objectIdParams } from '../middleware/objectIdParam';
import { Router } from 'express';
import {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getVehicleQRToken,
  scanRc
} from '../controllers/vehicleController';
import { uploadDocument, getVehicleDocuments } from '../controllers/documentController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { getRcVerification, verifyRc } from '../controllers/rcVerificationController';
import { rateLimiter, userKey } from '../middleware/rateLimiter';
import { upload } from '../services/uploadService';
import { validate } from '../middleware/validate';
import { createVehicleBody } from '../validators';

const router = Router();
objectIdParams(router, ['id', 'vehicleId']);

router.use(authenticate);

// RC photo -> Add Vehicle suggestions. OCR is CPU-heavy: same per-user limits as /documents/scan,
// checked before multer so a throttled request is cheap. Must come before '/:id'.
const rcScanBurst = rateLimiter(20, 60 * 1000, { keyBy: userKey });
const rcScanDaily = rateLimiter(200, 24 * 60 * 60 * 1000, { keyBy: userKey });
router.post('/scan-rc', authorizeRoles('owner'), rcScanBurst, rcScanDaily, upload.single('file'), scanRc);

router.post('/', validate({ body: createVehicleBody }), createVehicle);
router.get('/', getVehicles);
router.get('/:id', getVehicleById);
router.patch('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);

// Rotating 2-minute signed QR token for owner (Trust Rule 4)
router.get('/:id/qr-token', getVehicleQRToken);

router.get('/:id/rc-verification', authorizeRoles('owner', 'admin'), getRcVerification);
router.post('/:id/rc-verification', authorizeRoles('owner', 'admin'),
  rateLimiter(10, 60 * 60 * 1000, { keyBy: userKey }), verifyRc);

// Document upload & retrieval under vehicle
router.post('/:vehicleId/documents', upload.single('file'), uploadDocument);
router.get('/:vehicleId/documents', getVehicleDocuments);

export default router;
