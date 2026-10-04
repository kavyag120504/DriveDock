import crypto from 'crypto';
import Razorpay from 'razorpay';
import { ENV } from '../config/env';
import { DocumentType } from '../models/Document';

let razorpayInstance: Razorpay | null = null;
if (ENV.RAZORPAY_KEY_ID && ENV.RAZORPAY_KEY_SECRET && !ENV.RAZORPAY_KEY_ID.includes('placeholder')) {
  try {
    razorpayInstance = new Razorpay({
      key_id: ENV.RAZORPAY_KEY_ID,
      key_secret: ENV.RAZORPAY_KEY_SECRET
    });
  } catch (err) {
    console.warn('[PaymentService] Razorpay client init notice:', err);
  }
}

/**
 * Service fee in INR per document type. The order amount is always decided here
 * from the booking's document type, never taken from the client.
 */
export const SERVICE_FEES_INR: Record<DocumentType, number> = {
  puc: 250,
  insurance: 2400,
  rc: 1000,
  license: 1000,
  fitness: 1000
};

export interface CreateOrderParams {
  amount: number; // in INR
  receipt: string;
  notes?: Record<string, string>;
}

export const createRazorpayOrder = async (params: CreateOrderParams) => {
  const amountInPaise = Math.round(params.amount * 100);

  if (razorpayInstance) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: params.receipt,
        notes: params.notes || {}
      });
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key: ENV.RAZORPAY_KEY_ID
      };
    } catch (error) {
      console.warn('[PaymentService] Razorpay SDK create order failed, generating test order:', error);
    }
  }

  // Test mode fallback order
  const orderId = `order_dd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return {
    id: orderId,
    amount: amountInPaise,
    currency: 'INR',
    key: ENV.RAZORPAY_KEY_ID
  };
};

/**
 * CRITICAL TRUST RULE 6: Mandatory Server-Side Payment Verification
 * Razorpay Webhook/Callback verifies crypto.createHmac('sha256', secret)
 * before marking bookings as "confirmed". Never trust client-reported success!
 */
export const verifyRazorpaySignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean => {
  if (
    typeof razorpayOrderId !== 'string' ||
    typeof razorpayPaymentId !== 'string' ||
    typeof razorpaySignature !== 'string' ||
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature
  ) {
    return false;
  }

  const generatedSignature = crypto
    .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const expected = Buffer.from(generatedSignature, 'utf-8');
  const received = Buffer.from(razorpaySignature, 'utf-8');

  // timingSafeEqual throws on buffers of different length; a wrong-length signature is simply invalid
  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
};

/**
 * Helper to compute valid test signature for development testing
 */
export const generateTestSignature = (orderId: string, paymentId: string): string => {
  return crypto
    .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
};
