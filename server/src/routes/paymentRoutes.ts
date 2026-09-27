import { Router } from 'express';
import { createOrder, verifyPayment } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Create Razorpay Order
router.post('/create-order', createOrder);

// Verify HMAC SHA256 Signature (Trust Rule 6)
router.post('/verify', verifyPayment);

export default router;
