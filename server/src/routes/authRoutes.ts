import { Router } from 'express';
import { signup, login, refresh, logout, getMe, updatePushToken } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const authLimit = rateLimiter(10, 15 * 60 * 1000); // 10 attempts per 15 minutes per IP

const router = Router();

router.post('/signup', authLimit, signup);
router.post('/login', authLimit, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/push-token', authenticate, updatePushToken);

export default router;
