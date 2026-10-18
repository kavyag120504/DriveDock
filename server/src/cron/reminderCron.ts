import cron from 'node-cron';
import { runDueRemindersJob } from '../controllers/reminderController';
import { releaseExpiredPendingSlots } from '../controllers/bookingController';

export const initCronJobs = (): void => {
  // Daily midnight: send due reminders and mark expired documents
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily midnight reminder and document expiry check...');
    try {
      await runDueRemindersJob();
    } catch (error) {
      console.error('[Cron] Error running daily reminder job:', error);
    }
  });

  // Every 5 minutes: cancel bookings that stayed in "pending" (unpaid) for >30 min and free the slot
  cron.schedule('*/5 * * * *', async () => {
    try {
      await releaseExpiredPendingSlots();
    } catch (error) {
      console.error('[Cron] Error releasing expired pending slots:', error);
    }
  });

  console.log('[Cron] Node-cron initialized. Daily reminder at 00:00; slot cleanup every 5 min.');
};
