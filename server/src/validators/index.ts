/**
 * Per-route request-body schemas (Phase 2 hardening).
 *
 * Paired with middleware/validate.ts. Each schema is a deliberately LOOSE superset
 * of what its controller already accepts: it enforces field presence, primitive
 * type and basic shape only. All business rules (password length/complexity,
 * enum membership with a bespoke message, "provider does not offer X", renewal
 * windows, ownership, etc.) are left to the controller, which stays the single
 * source of the exact error messages the characterization tests assert on.
 *
 * Mongo ObjectIds arrive over JSON as plain strings, so id fields are typed as
 * strings here; controllers still own 404/403/cast handling. Numeric-ish fields
 * (year, phone, capacity) accept string-or-number because the mobile app and the
 * tests send both forms.
 *
 * Intentionally NOT schema-fronted (controller remains authoritative):
 *  - multipart/upload routes (POST /vehicles/:id/documents, POST /documents/scan,
 *    PATCH /bookings/:id/status) — bodies are form fields parsed by multer;
 *  - PATCH update routes with entirely-optional bodies and bespoke per-field
 *    messages (PATCH /vehicles/:id, PATCH /documents/:id, PATCH /providers/me);
 *  - transfer-paperwork routes — already have exhaustive field-level validation.
 */

import { z } from 'zod';

/** Accepts a number or a numeric string (the mobile app sends both). */
const numericLike = z.union([z.string(), z.number()]);

// ── auth ────────────────────────────────────────────────────────────────────

export const signupBody = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phone: numericLike,
  password: z.string().min(1), // length + letter/number rules enforced in the controller
  role: z.string().optional()
});

export const loginBody = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
});

export const refreshBody = z.object({
  refreshToken: z.string().min(1)
});

export const pushTokenBody = z.object({
  token: z.string().optional() // logout/clear sends an empty/omitted token
});

// ── vehicles ──────────────────────────────────────────────────────────────────

export const createVehicleBody = z.object({
  regNumber: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: numericLike,
  type: z.string().optional(),
  fuelType: z.string().optional(),
  region: z.unknown().optional()
});

// ── bookings ──────────────────────────────────────────────────────────────────

export const createBookingBody = z.object({
  vehicleId: z.string().min(1),
  providerId: z.string().min(1),
  slotId: z.string().min(1),
  documentType: z.string().min(1) // one-of enum + "centre doesn't offer" checked in the controller
});

// ── payments ──────────────────────────────────────────────────────────────────

export const createOrderBody = z.object({
  bookingId: z.string().min(1)
});

export const verifyPaymentBody = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  bookingId: numericLike.optional()
});

// ── providers ──────────────────────────────────────────────────────────────────

export const createProviderBody = z.object({
  businessName: z.string().min(1),
  address: z.string().min(1),
  coordinates: z.unknown().optional(), // presence + [lng,lat] shape handled in the controller
  serviceTypes: z.array(z.string()).optional(),
  workingHours: z.string().optional(),
  capacity: numericLike.optional()
});

export const createSlotsBody = z.object({
  slots: z.array(z.unknown()) // per-slot date/time/capacity validation stays in the controller
});

// ── admin ──────────────────────────────────────────────────────────────────────

export const createStaffUserBody = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phone: numericLike,
  password: z.string().min(1),
  role: z.string().min(1) // STAFF_ROLES membership + message checked in the controller
});

export const updateProviderStatusBody = z.object({
  status: z.string().min(1) // allowed-value check + message stays in the controller
});

// ── officer / violations ────────────────────────────────────────────────────────

export const logViolationBody = z.object({
  vehicleId: z.string().min(1),
  documentTypeExpired: z.union([z.string(), z.array(z.string())]),
  location: z.string(), // non-blank + "already valid" rules stay in the controller
  notes: z.string().optional()
});

// ── vehicle twin ────────────────────────────────────────────────────────────────

export const createTransferBody = z.object({
  vehicleId: z.string().min(1)
});

export const requestTransferBody = z.object({
  token: z.string().min(1)
});
