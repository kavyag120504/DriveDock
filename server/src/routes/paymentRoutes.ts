import { Router } from 'express';
import { createOrder, verifyPayment } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createOrderBody, verifyPaymentBody } from '../validators';

const router = Router();

router.use(authenticate);

// Create Razorpay Order
router.post('/create-order', validate({ body: createOrderBody }), createOrder);

// Verify HMAC SHA256 Signature (Trust Rule 6)
router.post('/verify', validate({ body: verifyPaymentBody }), verifyPayment);

export default router;
