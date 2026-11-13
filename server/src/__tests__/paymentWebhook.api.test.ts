/**
 * Characterization tests for the Razorpay webhook (Phase 4).
 *
 * The webhook is the server-to-server path that confirms a booking even when the app is
 * closed at capture time. Trust Rule 6 still holds: the ONLY thing trusted is the HMAC of
 * the raw request body, so these tests pin signature verification, idempotency, and that a
 * forged/garbled event can never confirm a booking.
 *
 * The app here mounts the handler exactly as index.ts does — express.raw() and NO JSON
 * parser — because the signature is computed over the raw bytes.
 */

import express from 'express';
import request from 'supertest';

import { razorpayWebhook } from '../controllers/paymentController';
import { errorHandler } from '../middleware/errorHandler';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { Slot } from '../models/Slot';
import { AuditLog } from '../models/AuditLog';
import { generateWebhookSignature } from '../services/paymentService';
import {
  setupTestDB,
  teardownTestDB,
  clearDB,
  makeOwner,
  makeProvider,
  makeVehicle,
  makeSlot
} from './helpers';

const app = express();
app.post('/api/v1/payments/webhook', express.raw({ type: '*/*' }), razorpayWebhook);
app.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

const makePaidablePayment = async (
  bookingStatus: 'pending' | 'confirmed' | 'cancelled' = 'pending',
  cancellationReason: string | null = null
) => {
  const owner = await makeOwner();
  const { provider } = await makeProvider('approved');
  const vehicle = await makeVehicle(owner._id.toString());
  // A pending booking holds a seat; a payment-timeout cancellation has freed it.
  const slot = await makeSlot(provider._id.toString(), {
    isBooked: bookingStatus !== 'cancelled'
  });
  const booking = await Booking.create({
    ownerId: owner._id,
    vehicleId: vehicle._id,
    providerId: provider._id,
    slotId: slot._id,
    documentType: 'puc',
    status: bookingStatus,
    ...(cancellationReason ? { cancellationReason } : {})
  });
  const orderId = `order_test_${booking._id.toString().slice(-8)}`;
  const payment = await Payment.create({
    bookingId: booking._id,
    amount: 250,
    razorpayOrderId: orderId,
    status: 'created'
  });
  return { owner, booking, payment, orderId, slot };
};

const capturedBody = (orderId: string, paymentId = 'pay_webhook_1'): string =>
  JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } }
  });

const postWebhook = (body: string, signature?: string) =>
  request(app)
    .post('/api/v1/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', signature ?? generateWebhookSignature(body))
    .send(body);

describe('POST /api/v1/payments/webhook', () => {
  test('a validly-signed payment.captured marks the payment paid and confirms the booking', async () => {
    const { booking, payment, orderId } = await makePaidablePayment();
    const body = capturedBody(orderId, 'pay_webhook_abc');

    const res = await postWebhook(body);

    expect(res.status).toBe(200);
    const freshPayment = await Payment.findById(payment._id);
    const freshBooking = await Booking.findById(booking._id);
    expect(freshPayment?.status).toBe('paid');
    expect(freshPayment?.razorpayPaymentId).toBe('pay_webhook_abc');
    expect(freshBooking?.status).toBe('confirmed');
  });

  test('writes a payment_verified audit row tagged as the webhook source', async () => {
    const { payment, orderId } = await makePaidablePayment();
    await postWebhook(capturedBody(orderId));

    const audit = await AuditLog.findOne({ entityId: payment._id, action: 'payment_verified' });
    expect(audit).toBeTruthy();
    expect(audit?.actorRole).toBe('system');
    expect(audit?.metadata?.source).toBe('webhook');
  });

  test('a forged signature is rejected (400) and nothing is confirmed', async () => {
    const { booking, payment, orderId } = await makePaidablePayment();
    const body = capturedBody(orderId);

    // Correct length, wrong secret → HMAC mismatch.
    const forged = 'f'.repeat(64);
    const res = await postWebhook(body, forged);

    expect(res.status).toBe(400);
    expect((await Payment.findById(payment._id))?.status).toBe('created');
    expect((await Booking.findById(booking._id))?.status).toBe('pending');
  });

  test('a missing signature is rejected (400)', async () => {
    const { orderId } = await makePaidablePayment();
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(capturedBody(orderId));
    expect(res.status).toBe(400);
  });

  test('a tampered body no longer matches its signature (400)', async () => {
    const { booking, orderId } = await makePaidablePayment();
    const body = capturedBody(orderId);
    const signature = generateWebhookSignature(body);
    // Sign the original, then send a different order's capture with that signature.
    const tampered = capturedBody('order_someone_else');
    const res = await postWebhook(tampered, signature);
    expect(res.status).toBe(400);
    expect((await Booking.findById(booking._id))?.status).toBe('pending');
  });

  test('is idempotent: a repeat delivery keeps the first payment id and stays confirmed', async () => {
    const { booking, payment, orderId } = await makePaidablePayment();
    await postWebhook(capturedBody(orderId, 'pay_first'));
    const res2 = await postWebhook(capturedBody(orderId, 'pay_second'));

    expect(res2.status).toBe(200);
    const freshPayment = await Payment.findById(payment._id);
    expect(freshPayment?.status).toBe('paid');
    expect(freshPayment?.razorpayPaymentId).toBe('pay_first'); // first capture wins
    expect((await Booking.findById(booking._id))?.status).toBe('confirmed');
  });

  test('an event for an unknown order is acknowledged (200) and changes nothing', async () => {
    const res = await postWebhook(capturedBody('order_not_in_db'));
    expect(res.status).toBe(200);
    expect(await Payment.countDocuments({ status: 'paid' })).toBe(0);
  });

  test('a non-capture event (valid signature) is acknowledged and ignored', async () => {
    const { booking, payment, orderId } = await makePaidablePayment();
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_x', order_id: orderId } } }
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(200);
    expect((await Payment.findById(payment._id))?.status).toBe('created');
    expect((await Booking.findById(booking._id))?.status).toBe('pending');
  });

  test('malformed JSON with a valid signature is rejected (400)', async () => {
    const body = '{not json';
    const res = await postWebhook(body, generateWebhookSignature(body));
    expect(res.status).toBe(400);
  });

  test('reinstates a payment-timeout cancellation when the slot is free', async () => {
    const { booking, payment, orderId, slot } = await makePaidablePayment(
      'cancelled',
      'payment_timeout'
    );
    // Slot was freed by the timeout; confirm it is reclaimable.
    await Slot.updateOne({ _id: slot._id }, { $set: { isBooked: false, bookedCount: 0 } });

    const res = await postWebhook(capturedBody(orderId));

    expect(res.status).toBe(200);
    expect((await Payment.findById(payment._id))?.status).toBe('paid');
    expect((await Booking.findById(booking._id))?.status).toBe('confirmed');
  });
});
