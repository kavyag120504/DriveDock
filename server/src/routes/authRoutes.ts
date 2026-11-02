import { Router } from 'express';
import { signup, login, refresh, logout, logoutAll, listSessions, getMe, updatePushToken } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { signupBody, loginBody, refreshBody, pushTokenBody } from '../validators';

const WINDOW_MS = 15 * 60 * 1000;
const signupLimit = rateLimiter(10, WINDOW_MS); // 10 sign-ups per 15 minutes per IP
const loginLimit = rateLimiter(10, WINDOW_MS, { countFailuresOnly: true }); // 10 failed logins per 15 minutes per IP

const router = Router();

router.post('/signup', signupLimit, validate({ body: signupBody }), signup);
router.post('/login', loginLimit, validate({ body: loginBody }), login);
router.post('/refresh', validate({ body: refreshBody }), refresh);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/sessions', authenticate, listSessions);
router.get('/me', authenticate, getMe);
router.post('/push-token', authenticate, validate({ body: pushTokenBody }), updatePushToken);

export default router;
