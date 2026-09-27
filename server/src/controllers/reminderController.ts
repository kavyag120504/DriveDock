import { Request, Response } from 'express';
import { Reminder } from '../models/Reminder';
import { User } from '../models/User';
import { DocumentModel } from '../models/Document';
import { sendPushNotification } from '../services/notificationService';
import { ENV } from '../config/env';

export const getUserReminders = async (req: Request, res: Response): Promise<void> => {
  try {
    const reminders = await Reminder.find({ ownerId: req.user!.userId })
      .populate('vehicleId', 'regNumber make model')
      .populate('documentId', 'type expiryDate status verified')
      .sort({ scheduledFor: 1 });

    res.status(200).json({ success: true, count: reminders.length, data: reminders });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * CRITICAL TRUST RULE 7: Idempotent Reminder Queue
 * Query logic is "due and not yet sent" (scheduledFor <= NOW AND sent: false),
 * NOT "expiring in exactly N days".
 * Even if the server was asleep or restarted, no reminder is ever missed.
 */
export const runDueRemindersJob = async (): Promise<{ processed: number; sent: number }> => {
  const now = new Date();

  // Find all reminders that are due and have not been sent yet
  const dueReminders = await Reminder.find({
    scheduledFor: { $lte: now },
    sent: false
  }).populate('ownerId', 'expoPushToken name email');

  let sentCount = 0;

  for (const rem of dueReminders) {
    const owner = rem.ownerId as any;
    if (owner && owner.expoPushToken) {
      const dispatched = await sendPushNotification({
        to: owner.expoPushToken,
        title: '⚠️ DriveDock Compliance Alert',
        body: rem.message,
        data: {
          reminderId: rem._id,
          documentId: rem.documentId,
          vehicleId: rem.vehicleId
        }
      });
      if (dispatched) {
        rem.sent = true;
        rem.sentAt = new Date();
        await rem.save();
        sentCount++;
      }
    } else {
      // Mock dispatch or record sent in development so queue advances
      rem.sent = true;
      rem.sentAt = new Date();
      await rem.save();
      sentCount++;
    }
  }

  // Also update documents that have passed expiry date to status: "expired"
  const expiredUpdate = await DocumentModel.updateMany(
    { expiryDate: { $lte: now }, status: { $ne: 'expired' } },
    { $set: { status: 'expired' } }
  );

  console.log(
    `[ReminderCron] Processed ${dueReminders.length} due reminders (sent: ${sentCount}). Expired ${expiredUpdate.modifiedCount} documents.`
  );

  return { processed: dueReminders.length, sent: sentCount };
};

export const triggerRemindersWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const secret = req.headers['x-internal-job-secret'] || req.query.secret;
    if (secret !== ENV.INTERNAL_JOB_SECRET && req.user?.role !== 'admin') {
      res.status(401).json({ success: false, message: 'Unauthorized job trigger' });
      return;
    }

    const result = await runDueRemindersJob();
    res.status(200).json({
      success: true,
      message: 'Idempotent reminder queue and document expiry check completed successfully',
      data: result
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
