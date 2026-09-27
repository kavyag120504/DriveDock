import { Router } from 'express';
import {
  createVehicle,
  getVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getVehicleQRToken
} from '../controllers/vehicleController';
import { uploadDocument, getVehicleDocuments } from '../controllers/documentController';
import { authenticate } from '../middleware/auth';
import { upload } from '../services/uploadService';

const router = Router();

router.use(authenticate);

router.post('/', createVehicle);
router.get('/', getVehicles);
router.get('/:id', getVehicleById);
router.patch('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);

// Rotating 2-minute signed QR token for owner (Trust Rule 4)
router.get('/:id/qr-token', getVehicleQRToken);

// Document upload & retrieval under vehicle
router.post('/:vehicleId/documents', upload.single('file'), uploadDocument);
router.get('/:vehicleId/documents', getVehicleDocuments);

export default router;
