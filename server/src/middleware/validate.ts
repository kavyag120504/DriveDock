/**
 * Request-body validation middleware (Phase 2 hardening).
 *
 * A thin wrapper around a zod schema that runs BEFORE the controller, so malformed
 * or wrongly-typed input is rejected at the front door with the API's standard
 * `{ success, message, errors }` shape instead of reaching business logic (or a
 * Mongoose cast error / 500).
 *
 * Design decisions that keep the existing characterization tests green:
 *  - VALIDATE-ONLY, NO MUTATION. We never reassign req.body/query/params from the
 *    parse result, so no field is ever stripped or coerced out from under a
 *    controller. zod objects ignore unknown keys by default, so extra fields a
 *    controller still reads pass straight through untouched.
 *  - The route schemas deliberately check only presence + primitive type + shape.
 *    Every *business rule* (password complexity, "provider does not offer X",
 *    enum membership with a bespoke message, etc.) stays in the controller, which
 *    remains the single source of those exact error messages the tests assert on.
 *  - On a non-zod error we defer to the shared errorHandler via next(err).
 */

import type { RequestHandler } from 'express';
import { ZodError, ZodType } from 'zod';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** Flatten zod issues into a `{ 'path.to.field': message }` map for the response. */
const formatIssues = (err: ZodError): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!(key in out)) out[key] = issue.message; // keep the first message per field
  }
  return out;
};

/**
 * Build a middleware that validates the named request parts against zod schemas.
 * Parsing is for validation only; the parsed result is intentionally discarded so
 * the request objects reach the controller exactly as the client sent them.
 */
export const validate = (schemas: RequestSchemas): RequestHandler => (req, res, next) => {
  try {
    if (schemas.params) schemas.params.parse(req.params);
    if (schemas.query) schemas.query.parse(req.query);
    if (schemas.body) schemas.body.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: formatIssues(err)
      });
      return;
    }
    next(err);
  }
};
