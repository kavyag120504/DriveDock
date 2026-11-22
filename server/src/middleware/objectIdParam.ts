import { Router } from 'express';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Answers 404 for a URL parameter that cannot be a MongoDB id, before any controller runs. Without it a
 * path such as GET /vehicles/scan-rc (a POST-only route that the "/:id" route then catches) reached the
 * database, failed to cast "scan-rc" to an ObjectId and came back as a 500.
 */
export const objectIdParams = (router: Router, names: string[] = ['id', 'vehicleId']): void => {
  for (const name of names) {
    router.param(name, (_req, res, next, value: string) => {
      if (OBJECT_ID.test(value)) return next();
      res.status(404).json({ success: false, message: 'Not found' });
    });
  }
};
