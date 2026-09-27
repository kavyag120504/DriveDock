import { Router } from 'express';
import { updateDocument } from '../controllers/documentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.patch('/:id', updateDocument);

export default router;
