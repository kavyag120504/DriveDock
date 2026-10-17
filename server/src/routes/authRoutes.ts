import { Router } from 'express';
import { signup, login, refresh, logout, getMe, updatePushToken } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/push-token', authenticate, updatePushToken);

export default router;
