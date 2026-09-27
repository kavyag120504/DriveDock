import cron from 'node-cron';
import { runDueRemindersJob } from '../controllers/reminderController';

export const initCronJobs = (): void => {
  // Run daily at midnight (00:00:00)
  // Also runs every hour to check for any newly due reminders in active environments
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily midnight reminder and document expiry check...');
    try {
      await runDueRemindersJob();
    } catch (error) {
      console.error('[Cron] Error running daily reminder job:', error);
    }
  });

  console.log('[Cron] Node-cron initialized. Scheduled daily at 00:00.');
};
