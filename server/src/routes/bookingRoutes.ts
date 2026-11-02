import { Router } from 'express';
import {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus
} from '../controllers/bookingController';
import { authenticate } from '../middleware/auth';
import { upload } from '../services/uploadService';
import { validate } from '../middleware/validate';
import { createBookingBody } from '../validators';

const router = Router();

router.use(authenticate);

// Atomic slot booking (Trust Rule 5)
router.post('/', validate({ body: createBookingBody }), createBooking);
router.get('/', getBookings);
router.get('/:id', getBookingById);

// Provider completion sets document verified: true (Trust Rule 1)
router.patch('/:id/status', upload.single('certificate'), updateBookingStatus);

export default router;
