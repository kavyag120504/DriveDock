/**
 * Characterization tests for payments: server-decided amount + HMAC verification
 * (Trust Rule 6). These also PIN the known "self-confirm" gap: a client that can
 * compute the HMAC (the secret lives in source today) can confirm its own booking.
 * When Phase 3 introduces real Razorpay orders/webhooks and removes the test
 * signature helper, the self-confirm test here must be updated deliberately.
 */

import express from 'express';
import request from 'supertest';

import paymentRoutes from '../routes/paymentRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { AuditLog } from '../models/AuditLog';
import { generateTestSignature } from '../services/paymentService';
import {
  setupTestDB,
  teardownTestDB,
  clearDB,
  makeOwner,
  makeProvider,
  makeVehicle,
  makeSlot,
  authHeader
} from './helpers';

const app = express();
app.use(express.json());
app.use('/payments', paymentRoutes);
app.use(errorHandler);

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

const makePendingBooking = async (documentType: any = 'puc') => {
  const owner = await makeOwner();
  const { provider } = await makeProvider('approved');
  const vehicle = await makeVehicle(owner._id.toString());
  const slot = await makeSlot(provider._id.toString(), { isBooked: true });
  const booking = await Booking.create({
    ownerId: owner._id, vehicleId: vehicle._id, providerId: provider._id,
    slotId: slot._id, documentType, status: 'pending'
  });
  return { owner, booking };
};

describe('POST /payments/create-order', () => {
  test('requires bookingId (400)', async () => {
    const owner = await makeOwner();
    const res = await request(app).post('/payments/create-order').set('Authorization', authHeader(owner)).send({});
    expect(res.status).toBe(400);
  });

  test('server sets the amount from the fee table, ignoring any client amount', async () => {
    const { owner, booking } = await makePendingBooking('puc'); // PUC = 250 INR
    const res = await request(app)
      .post('/payments/create-order')
      .set('Authorization', authHeader(owner))
      .send({ bookingId: booking._id, amount: 1 }); // client-sent amount must be ignored

    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(25000); // 250 INR in paise
    const payment = await Payment.findOne({ bookingId: booking._id });
    expect(payment!.amount).toBe(250);
    expect(payment!.status).toBe('created');
  });

  test('insurance booking costs 2400 INR', async () => {
    const { owner, booking } = await makePendingBooking('insurance');
    const res = await request(app)
      .post('/payments/create-order')
      .set('Authorization', authHeader(owner))
      .send({ bookingId: booking._id });
    expect(res.body.data.amount).toBe(240000);
  });

  test('another owner cannot create an order for someone else’s booking (403)', async () => {
    const { booking } = await makePendingBooking();
    const stranger = await makeOwner();
    const res = await request(app)
      .post('/payments/create-order')
      .set('Authorization', authHeader(stranger))
      .send({ bookingId: booking._id });
    expect(res.status).toBe(403);
  });

  test('cannot create an order for a non-pending booking (409)', async () => {
    const { owner, booking } = await makePendingBooking();
    await Booking.findByIdAndUpdate(booking._id, { status: 'confirmed' });
    const res = await request(app)
      .post('/payments/create-order')
      .set('Authorization', authHeader(owner))
      .send({ bookingId: booking._id });
    expect(res.status).toBe(409);
  });
});

describe('POST /payments/verify', () => {
  const createOrder = async (owner: any, booking: any) => {
    const res = await request(app)
      .post('/payments/create-order')
      .set('Authorization', authHeader(owner))
      .send({ bookingId: booking._id });
    return res.body.data.orderId as string;
  };

  test('missing signature fields returns 400', async () => {
    const owner = await makeOwner();
    const res = await request(app)
      .post('/payments/verify')
      .set('Authorization', authHeader(owner))
      .send({ razorpayOrderId: 'order_x' });
    expect(res.status).toBe(400);
  });

  test('unknown order returns 404', async () => {
    const owner = await makeOwner();
    const res = await request(app)
      .post('/payments/verify')
      .set('Authorization', authHeader(owner))
      .send({ razorpayOrderId: 'order_missing', razorpayPaymentId: 'pay_1', razorpaySignature: 'deadbeef' });
    expect(res.status).toBe(404);
  });

  test('a wrong signature returns 400 and marks the payment failed', async () => {
    const { owner, booking } = await makePendingBooking();
    const orderId = await createOrder(owner, booking);
    const res = await request(app)
      .post('/payments/verify')
      .set('Authorization', authHeader(owner))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 'wrong-signature' });
    expect(res.status).toBe(400);
    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    expect(payment!.status).toBe('failed');
  });

  test('a valid HMAC signature confirms the booking (self-confirm gap, pinned)', async () => {
    const { owner, booking } = await makePendingBooking();
    const orderId = await createOrder(owner, booking);
    const paymentId = 'pay_test_abc';
    const signature = generateTestSignature(orderId, paymentId);

    const res = await request(app)
      .post('/payments/verify')
      .set('Authorization', authHeader(owner))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature, bookingId: booking._id });

    expect(res.status).toBe(200);
    const confirmed = await Booking.findById(booking._id);
    expect(confirmed!.status).toBe('confirmed');
    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    expect(payment!.status).toBe('paid');

    // A successful verification writes exactly one append-only audit row (ids/amount only).
    const audits = await AuditLog.find({ action: 'payment_verified' });
    expect(audits).toHaveLength(1);
    expect(String(audits[0].entityId)).toBe(String(payment!._id));
    expect(audits[0].metadata).toMatchObject({ bookingId: String(booking._id), amount: payment!.amount });
  });

  test('a bookingId that does not match the payment’s order returns 400', async () => {
    const { owner, booking } = await makePendingBooking();
    const orderId = await createOrder(owner, booking);
    const paymentId = 'pay_test_abc';
    const signature = generateTestSignature(orderId, paymentId);

    const res = await request(app)
      .post('/payments/verify')
      .set('Authorization', authHeader(owner))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature, bookingId: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(400);
  });

  test('a non-owner cannot verify a payment (403)', async () => {
    const { owner, booking } = await makePendingBooking();
    const orderId = await createOrder(owner, booking);
    const stranger = await makeOwner();
    const paymentId = 'pay_test_abc';
    const signature = generateTestSignature(orderId, paymentId);

    const res = await request(app)
      .post('/payments/verify')
      .set('Authorization', authHeader(stranger))
      .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: signature });
    expect(res.status).toBe(403);
  });
});
