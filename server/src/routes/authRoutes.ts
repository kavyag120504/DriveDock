import { Router } from 'express';
import { signup, login, refresh, getMe, updatePushToken } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authenticate, getMe);
router.post('/push-token', authenticate, updatePushToken);

export default router;
