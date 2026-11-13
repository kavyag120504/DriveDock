import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Payment } from '../models/Payment';
import { Booking, IBooking } from '../models/Booking';
import { reserveSeat, releaseSeat } from '../services/slotService';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  generateTestSignature,
  SERVICE_FEES_INR
} from '../services/paymentService';
import { isOwnerOrAdmin } from '../services/accessService';
import { recordAudit } from '../services/auditLog';
import { isProduction, hasRealRazorpayWebhookSecret } from '../config/env';
import { logger } from '../config/logger';

/**
 * Move a booking to `confirmed` after its payment is proven paid. Idempotent and
 * atomic so the unpaid-booking cron can never race it. Shared by the client-side
 * verify call and the Razorpay webhook so the two can never drift.
 *
 * Returns the confirmed booking, or null when it can't be honoured (its slot was
 * released after a payment timeout and could not be reclaimed) — the caller then
 * leaves the payment `paid` for a refund.
 */
const settleBookingAfterPayment = async (
  bookingId: Types.ObjectId | string
): Promise<IBooking | null> => {
  // Confirm only a booking that is still pending.
  let updatedBooking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'pending' },
    { $set: { status: 'confirmed' } },
    { new: true }
  );

  // The booking was released because it stayed unpaid too long: reinstate it only if
  // its slot is still free, claimed atomically so it can't be double-booked.
  if (!updatedBooking) {
    const current = await Booking.findById(bookingId);
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

  return updatedBooking;
};

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
      // Only an unpaid order can be marked failed: a bad call must never downgrade a payment that went through
      await Payment.updateOne({ _id: payment._id, status: 'created' }, { $set: { status: 'failed' } });

      res.status(400).json({
        success: false,
        message: 'Cryptographic signature verification failed! Possible tamper attempt.'
      });
      return;
    }

    // Payment signature is valid. The first verified payment id is kept; a repeat call can't replace it.
    if (payment.status !== 'paid') {
      payment.status = 'paid';
      payment.razorpayPaymentId = razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature;
      await payment.save();

      // Append-only audit of the first successful verification (ids/amount only, never PII).
      await recordAudit({
        actorId: req.user?.userId,
        actorRole: req.user?.role ?? 'system',
        action: 'payment_verified',
        entityType: 'payment',
        entityId: payment._id,
        metadata: { bookingId: String(booking._id), amount: payment.amount },
        ip: req.ip
      });
    }

    // Re-verifying a payment for a booking that is already confirmed or completed changes nothing
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      res.status(200).json({
        success: true,
        message: `Payment already verified. Booking is ${booking.status.toUpperCase()}.`,
        data: { payment, booking }
      });
      return;
    }

    // Confirm the booking (atomic; reinstates a payment-timeout cancellation if the slot is free)
    const updatedBooking = await settleBookingAfterPayment(booking._id);

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

/**
 * Razorpay webhook (Phase 4): confirm a booking even if the app is closed when the
 * payment captures. Razorpay POSTs the event and signs the RAW body with the dashboard
 * webhook secret (X-Razorpay-Signature). This route is UNAUTHENTICATED (server-to-server)
 * and is mounted with express.raw() BEFORE the JSON body parser, so req.body is a Buffer.
 *
 * Security: the HMAC over the raw bytes is the only trust anchor. In production we refuse
 * to act unless a real webhook secret is configured, so an attacker can't forge an event
 * with the public dev-default secret. Idempotent: a repeat delivery changes nothing.
 * We ack every event we recognise with 200 so Razorpay stops retrying; only a bad
 * signature returns a non-2xx.
 */
export const razorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    // In production, never act on the public placeholder secret (anyone could forge events).
    if (isProduction() && !hasRealRazorpayWebhookSecret()) {
      res.status(503).json({ success: false, message: 'Razorpay webhook is not configured' });
      return;
    }

    // express.raw() gives a Buffer; fall back defensively if some parser ran first.
    const rawBody: Buffer | string = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});

    const signature = req.header('x-razorpay-signature') || '';
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      return;
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      res.status(400).json({ success: false, message: 'Malformed webhook payload' });
      return;
    }

    // We only act on a captured payment; every other event is acknowledged and ignored.
    if (event?.event !== 'payment.captured') {
      res.status(200).json({ success: true, message: 'Event ignored' });
      return;
    }

    const entity = event?.payload?.payment?.entity;
    const razorpayOrderId: string | undefined = entity?.order_id;
    const razorpayPaymentId: string | undefined = entity?.id;

    if (!razorpayOrderId) {
      // Nothing to correlate; ack so Razorpay stops retrying.
      res.status(200).json({ success: true, message: 'No order id on event' });
      return;
    }

    const payment = await Payment.findOne({ razorpayOrderId });
    if (!payment) {
      // Not one of our orders (or a stale test event); ack and move on.
      res.status(200).json({ success: true, message: 'Unknown order; ignored' });
      return;
    }

    // Mark paid idempotently — the first captured id wins; a repeat delivery is a no-op.
    if (payment.status !== 'paid') {
      payment.status = 'paid';
      if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
      await payment.save();

      await recordAudit({
        actorRole: 'system',
        action: 'payment_verified',
        entityType: 'payment',
        entityId: payment._id,
        metadata: { bookingId: String(payment.bookingId), amount: payment.amount, source: 'webhook' },
        ip: req.ip
      });
    }

    // Confirm the booking if it isn't already (idempotent, atomic). A booking whose slot
    // was lost after a payment timeout stays unconfirmed; the payment remains 'paid' for a refund.
    await settleBookingAfterPayment(payment.bookingId);

    res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    logger.error({ err: error }, '[PaymentController.razorpayWebhook] error');
    // A 500 makes Razorpay retry, which is the desired behaviour on a transient failure.
    res.status(500).json({ success: false, message: 'Webhook processing error' });
  }
};
