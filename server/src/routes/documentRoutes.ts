import { Router } from 'express';
import { updateDocument, scanDocument } from '../controllers/documentController';
import { authenticate } from '../middleware/auth';
import { upload } from '../services/uploadService';
import { rateLimiter, userKey } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);

// OCR is CPU-heavy, so cap it per authenticated user: a short burst limit plus a
// daily quota. Keyed by user id (falls back to IP), so one user can't exhaust the
// server for everyone. Both run before multer/OCR, so a throttled request is cheap.
const scanBurstLimit = rateLimiter(20, 60 * 1000, { keyBy: userKey }); // 20/min
const scanDailyQuota = rateLimiter(200, 24 * 60 * 60 * 1000, { keyBy: userKey }); // 200/day

// Must come before '/:id' so Express doesn't treat 'scan' as an :id param.
router.post('/scan', scanBurstLimit, scanDailyQuota, upload.single('file'), scanDocument);
router.patch('/:id', updateDocument);

export default router;
