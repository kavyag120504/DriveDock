import { Router } from 'express';
import authRoutes from './authRoutes';
import vehicleRoutes from './vehicleRoutes';
import documentRoutes from './documentRoutes';
import providerRoutes from './providerRoutes';
import bookingRoutes from './bookingRoutes';
import paymentRoutes from './paymentRoutes';
import reminderRoutes from './reminderRoutes';
import verificationRoutes from './verificationRoutes';
import officerRoutes, { violationRoutes } from './officerRoutes';
import challanRoutes from './challanRoutes';
import adminRoutes from './adminRoutes';
import stationRoutes from './stationRoutes';
import twinRoutes from './twin.routes';
import { updatePushToken } from '../controllers/authController';
import { publicTwinView } from '../controllers/twin.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use('/auth', authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/documents', documentRoutes);
router.use('/providers', providerRoutes);
router.use('/stations', stationRoutes);  // ← NEW: geo-proximity station search
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/reminders', reminderRoutes);
router.use('/public', verificationRoutes);
router.use('/officer', officerRoutes);
router.use('/violations', violationRoutes);
router.use('/challans', challanRoutes);
router.use('/admin', adminRoutes);
router.use('/twin', twinRoutes);

// Public Vehicle Twin share view — no auth required
router.get('/public/twin', publicTwinView);

// User push token route
router.post('/users/push-token', authenticate, updatePushToken);

export default router;
