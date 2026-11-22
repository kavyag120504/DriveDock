import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listNotifications, markNotificationsRead } from '../controllers/notificationController';

const router = Router();
router.use(authenticate);

router.get('/', listNotifications);
router.post('/read', markNotificationsRead);

export default router;
