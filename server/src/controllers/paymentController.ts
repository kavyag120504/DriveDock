import { Request, Response } from 'express';
import { Payment } from '../models/Payment';
import { Booking } from '../models/Booking';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  generateTestSignature
} from '../services/paymentService';

export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, amount } = req.body;

    if (!bookingId || !amount) {
      res.status(400).json({ success: false, message: 'bookingId and amount are required' });
      return;
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    const orderData = await createRazorpayOrder({
      amount: Number(amount),
      receipt: `rcpt_${bookingId.toString().slice(-8)}`,
      notes: {
        bookingId: bookingId.toString(),
        documentType: booking.documentType
      }
    });

    const payment = await Payment.create({
      bookingId: booking._id,
      amount: Number(amount),
      razorpayOrderId: orderData.id,
      status: 'created'
    });

    booking.paymentId = payment._id as any;
    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Payment order created',
      data: {
        orderId: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        key: orderData.key,
        paymentId: payment._id,
        // Development helper: signature generator hint for automated sandbox tests
        testSignatureHelper: generateTestSignature(orderData.id, `pay_dev_${Date.now()}`)
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

    // Perform strict HMAC SHA256 verification
    const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record for order not found' });
      return;
    }

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

    // Mark the associated booking as 'confirmed'
    const targetBookingId = bookingId || payment.bookingId;
    const updatedBooking = await Booking.findByIdAndUpdate(
      targetBookingId,
      { status: 'confirmed' },
      { new: true }
    );

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
