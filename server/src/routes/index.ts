import { Router } from 'express';
import authRoutes from './authRoutes';
import vehicleRoutes from './vehicleRoutes';
import documentRoutes from './documentRoutes';
import providerRoutes from './providerRoutes';
import bookingRoutes from './bookingRoutes';
import paymentRoutes from './paymentRoutes';
import reminderRoutes from './reminderRoutes';
import verificationRoutes from './verificationRoutes';
import officerRoutes from './officerRoutes';
import challanRoutes from './challanRoutes';
import adminRoutes from './adminRoutes';
import stationRoutes from './stationRoutes';
import { updatePushToken } from '../controllers/authController';
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
router.use('/violations', officerRoutes);
router.use('/challans', challanRoutes);
router.use('/admin', adminRoutes);

// User push token route
router.post('/users/push-token', authenticate, updatePushToken);

export default router;
