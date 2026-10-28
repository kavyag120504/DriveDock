import { Router } from 'express';
import { signup, login, refresh, logout, getMe, updatePushToken } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';

const WINDOW_MS = 15 * 60 * 1000;
const signupLimit = rateLimiter(10, WINDOW_MS); // 10 sign-ups per 15 minutes per IP
const loginLimit = rateLimiter(10, WINDOW_MS, { countFailuresOnly: true }); // 10 failed logins per 15 minutes per IP

const router = Router();

router.post('/signup', signupLimit, signup);
router.post('/login', loginLimit, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/push-token', authenticate, updatePushToken);

export default router;
