import { Router, Request, Response } from 'express';
import { ENV } from '../config/env';
import { Provider } from '../models/Provider';

/**
 * Demo-only helpers for presentations. Disabled unless DEMO_MODE=true is set in the
 * server's environment, so they never exist on a real deployment.
 */
const router = Router();

router.use((_req: Request, res: Response, next) => {
  if (!ENV.DEMO_MODE) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }
  next();
});

// Lists every station with its manager's login email, so the app's development-only
// login switcher can sign in as any station (seeded demo accounts only)
router.get('/stations', async (_req: Request, res: Response) => {
  try {
    const providers = await Provider.find({})
      .populate('userId', 'email')
      .sort({ status: 1, businessName: 1 });

    res.status(200).json({
      success: true,
      data: providers.map((p: any) => ({
        providerId: p._id,
        businessName: p.businessName,
        address: p.address,
        status: p.status,
        email: p.userId?.email || null
      }))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
