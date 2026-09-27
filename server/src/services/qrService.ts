import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface QRPayload {
  vehicleId: string;
  regNumber: string;
  timestamp: number;
  nonce: string;
}

/**
 * Generate a rotating time-bound signed QR token valid for exactly 120 seconds (2 minutes).
 * Any screenshot taken will become invalid within 2 minutes.
 */
export const generateQRToken = (vehicleId: string, regNumber: string): { token: string; expiresIn: number; expiresAt: number } => {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 120; // 2 minutes
  const expiresAt = now + expiresIn;
  const nonce = Math.random().toString(36).substring(2, 10);

  const payload: QRPayload = {
    vehicleId,
    regNumber,
    timestamp: now,
    nonce
  };

  const token = jwt.sign(payload, ENV.QR_SECRET, {
    expiresIn: `${expiresIn}s`
  });

  return { token, expiresIn, expiresAt };
};

/**
 * Verifies the signed rotating QR token.
 * Validates cryptographic signature and ensures token is not expired.
 */
export const verifyQRToken = (token: string): { valid: boolean; payload?: QRPayload; error?: string } => {
  try {
    const decoded = jwt.verify(token, ENV.QR_SECRET) as QRPayload;
    return { valid: true, payload: decoded };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'QR Token has expired. Please refresh the QR code on the owner screen.' };
    }
    return { valid: false, error: 'Invalid or forged QR Token signature.' };
  }
};
