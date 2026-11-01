import { Router } from 'express';
import { updateDocument, scanDocument } from '../controllers/documentController';
import { authenticate } from '../middleware/auth';
import { upload } from '../services/uploadService';

const router = Router();

router.use(authenticate);
// Must come before '/:id' so Express doesn't treat 'scan' as an :id param.
router.post('/scan', upload.single('file'), scanDocument);
router.patch('/:id', updateDocument);

export default router;
