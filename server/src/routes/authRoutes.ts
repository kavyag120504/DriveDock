import { Router } from 'express';
import { signup, login, refresh, logout, logoutAll, listSessions, exportMyData, deleteMyAccount, getMe, updatePushToken } from '../controllers/authController';
import { forgotPassword, resetPassword } from '../controllers/passwordResetController';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { signupBody, loginBody, refreshBody, pushTokenBody, forgotPasswordBody, resetPasswordBody } from '../validators';

const WINDOW_MS = 15 * 60 * 1000;
const signupLimit = rateLimiter(10, WINDOW_MS); // 10 sign-ups per 15 minutes per IP
const loginLimit = rateLimiter(10, WINDOW_MS, { countFailuresOnly: true }); // 10 failed logins per 15 minutes per IP

const forgotLimit = rateLimiter(5, WINDOW_MS); // 5 code requests per 15 minutes per IP
const resetLimit = rateLimiter(10, WINDOW_MS, { countFailuresOnly: true }); // 10 wrong codes per 15 minutes per IP

const router = Router();

router.post('/signup', signupLimit, validate({ body: signupBody }), signup);
router.post('/login', loginLimit, validate({ body: loginBody }), login);
router.post('/forgot-password', forgotLimit, validate({ body: forgotPasswordBody }), forgotPassword);
router.post('/reset-password', resetLimit, validate({ body: resetPasswordBody }), resetPassword);
router.post('/refresh', validate({ body: refreshBody }), refresh);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/sessions', authenticate, listSessions);
router.get('/export', authenticate, exportMyData);
router.delete('/account', authenticate, deleteMyAccount);
router.get('/me', authenticate, getMe);
router.post('/push-token', authenticate, validate({ body: pushTokenBody }), updatePushToken);

export default router;
