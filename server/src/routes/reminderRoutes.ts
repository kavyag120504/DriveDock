import { Router } from 'express';
import { getUserReminders, triggerRemindersWebhook } from '../controllers/reminderController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getUserReminders);
// Internal cron trigger or secret webhook
router.post('/trigger-job', triggerRemindersWebhook);

export default router;
