import cron from 'node-cron';
import { runDueRemindersJob } from '../controllers/reminderController';
import { releaseExpiredPendingSlots } from '../controllers/bookingController';
import { runPaperworkRetention } from '../services/transferPaperwork.service';

/**
 * Starts the scheduled jobs and returns their handles so a graceful shutdown can
 * stop them before the process exits. Phase 4 replaces node-cron with BullMQ.
 */
export const initCronJobs = (): cron.ScheduledTask[] => {
  // Daily midnight: send due reminders and mark expired documents
  const reminderTask = cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily midnight reminder and document expiry check...');
    try {
      await runDueRemindersJob();
    } catch (error) {
      console.error('[Cron] Error running daily reminder job:', error);
    }
  });

  // Daily 00:30: delete paperwork for transfers that never completed and wipe personal details past retention
  cron.schedule('30 0 * * *', async () => {
    try {
      const { deleted, wiped } = await runPaperworkRetention();
      console.log(`[Cron] Paperwork retention: deleted ${deleted}, wiped personal details on ${wiped}.`);
    } catch (error) {
      console.error('[Cron] Error running paperwork retention:', error);
    }
  });

  // Every 5 minutes: cancel bookings that stayed in "pending" (unpaid) for >30 min and free the slot
  const slotCleanupTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await releaseExpiredPendingSlots();
    } catch (error) {
      console.error('[Cron] Error releasing expired pending slots:', error);
    }
  });

  console.log('[Cron] Node-cron initialized. Daily reminder at 00:00; slot cleanup every 5 min.');
  return [reminderTask, slotCleanupTask];
};
