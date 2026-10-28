import { Request, Response } from 'express';
import { Payment } from '../models/Payment';
import { Booking } from '../models/Booking';
import { reserveSeat, releaseSeat } from '../services/slotService';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  generateTestSignature,
  SERVICE_FEES_INR
} from '../services/paymentService';
import { isOwnerOrAdmin } from '../services/accessService';

export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      res.status(400).json({ success: false, message: 'bookingId is required' });
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    // Only the booking's owner (or admin) can pay for it
    if (!isOwnerOrAdmin(req.user!, booking.ownerId)) {
      res.status(403).json({ success: false, message: 'Forbidden: you are not authorized to pay for this booking' });
      return;
    }

    // Only an unpaid booking that still holds its slot can be paid for
    if (booking.status !== 'pending') {
      res.status(409).json({ success: false, message: `Booking is ${booking.status} and can no longer be paid for` });
      return;
    }

    // The amount is decided here from the booking's document type; any client-sent amount is ignored
    const amount = SERVICE_FEES_INR[booking.documentType];
    if (!amount) {
      res.status(400).json({ success: false, message: `No service fee configured for document type '${booking.documentType}'` });
      return;
    }

    const orderData = await createRazorpayOrder({
      amount,
      receipt: `rcpt_${bookingId.toString().slice(-8)}`,
      notes: {
        bookingId: bookingId.toString(),
        documentType: booking.documentType
      }
    });

    const payment = await Payment.create({
      bookingId: booking._id,
      amount,
      razorpayOrderId: orderData.id,
      status: 'created'
    });

    booking.paymentId = payment._id as any;
    await booking.save();

    // TEST MODE ONLY (until real Razorpay checkout): a simulated payment id and the signature
    // Razorpay would send for it. Both must be sent back together to /payments/verify.
    const testPaymentId = `pay_test_${Date.now()}`;

    res.status(201).json({
      success: true,
      message: 'Payment order created',
      data: {
        orderId: orderData.id,
        amount: orderData.amount, // in paise
        currency: orderData.currency,
        key: orderData.key,
        paymentId: payment._id,
        testPaymentId,
        testSignatureHelper: generateTestSignature(orderData.id, testPaymentId)
      }
    });
  } catch (error: any) {
    console.error('[PaymentController.createOrder] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CRITICAL TRUST RULE 6: Mandatory Server-Side Payment Verification
 * Razorpay Webhook/Callback verifies crypto.createHmac('sha256', secret)
 * before marking bookings as "confirmed". Never trust client-reported success!
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are strictly required'
      });
      return;
    }

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record for order not found' });
      return;
    }

    // Only the owner of the booking this payment was created for (or admin) can verify it
    const booking = await Booking.findById(payment.bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    if (!isOwnerOrAdmin(req.user!, booking.ownerId)) {
      res.status(403).json({ success: false, message: 'Forbidden: you are not authorized to verify this payment' });
      return;
    }

    // A payment can only confirm the booking its order was created for
    if (bookingId && bookingId.toString() !== booking._id.toString()) {
      res.status(400).json({ success: false, message: 'bookingId does not match the booking for this payment order' });
      return;
    }

    // Perform strict HMAC SHA256 verification
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      payment.status = 'failed';
      await payment.save();

      res.status(400).json({
        success: false,
        message: 'Cryptographic signature verification failed! Possible tamper attempt.'
      });
      return;
    }

    // Payment signature is valid
    payment.status = 'paid';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    // Re-verifying a payment for a booking that is already confirmed or completed changes nothing
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      res.status(200).json({
        success: true,
        message: `Payment already verified. Booking is ${booking.status.toUpperCase()}.`,
        data: { payment, booking }
      });
      return;
    }

    // Confirm only a booking that is still pending (atomic, so the unpaid-booking job can't race it)
    let updatedBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'confirmed' } },
      { new: true }
    );

    // The booking was released because it stayed unpaid too long: reinstate it only if
    // its slot is still free, claimed atomically so it can't be double-booked
    if (!updatedBooking) {
      const current = await Booking.findById(booking._id);
      if (current?.status === 'cancelled' && current.cancellationReason === 'payment_timeout') {
        const slot = await reserveSeat({ _id: current.slotId });
        if (slot) {
          try {
            updatedBooking = await Booking.findOneAndUpdate(
              { _id: current._id, status: 'cancelled' },
              { $set: { status: 'confirmed', cancellationReason: null } },
              { new: true }
            );
          } catch (err: any) {
            // The owner has since booked this renewal again (one active booking per vehicle and document)
            if (err?.code !== 11000) throw err;
          }
          if (!updatedBooking) {
            await releaseSeat(current.slotId);
          }
        }
      }
    }

    if (!updatedBooking) {
      // Money was taken but the booking can't be honoured; the payment stays 'paid' so it can be refunded
      res.status(409).json({
        success: false,
        message: 'Payment received, but this booking was cancelled and its slot is no longer available. The payment is recorded for a refund.',
        data: { payment }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully via HMAC SHA256. Booking is now CONFIRMED.',
      data: {
        payment,
        booking: updatedBooking
      }
    });
  } catch (error: any) {
    console.error('[PaymentController.verifyPayment] error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
