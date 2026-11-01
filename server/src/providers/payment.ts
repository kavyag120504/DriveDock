/**
 * PaymentProvider — wraps the existing Razorpay service so controllers depend on
 * an interface, not the vendor SDK directly. Behaviour is identical to today's
 * paymentService; Phase 4/5 adds webhooks, refunds and reconciliation here.
 */

import { AdapterMode } from './types';
import { hasRealRazorpayKeys } from '../config/env';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  generateTestSignature,
  CreateOrderParams
} from '../services/paymentService';

export interface PaymentOrder {
  id: string;
  // Razorpay's SDK types amount as string | number; kept faithful to the source.
  amount: number | string;
  currency: string;
  key: string;
}

export interface PaymentProvider {
  readonly mode: AdapterMode;
  createOrder(params: CreateOrderParams): Promise<PaymentOrder>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Dev/sandbox-only helper used by the test checkout flow. Removed in Phase 4. */
  testSignature(orderId: string, paymentId: string): string | null;
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly mode: AdapterMode = hasRealRazorpayKeys() ? 'real' : 'sandbox';

  createOrder(params: CreateOrderParams): Promise<PaymentOrder> {
    return createRazorpayOrder(params);
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    return verifyRazorpaySignature(orderId, paymentId, signature);
  }

  testSignature(orderId: string, paymentId: string): string | null {
    // Only offered outside 'real' mode so production never exposes a self-confirm path.
    return this.mode === 'real' ? null : generateTestSignature(orderId, paymentId);
  }
}
