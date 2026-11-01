import { Types } from 'mongoose';
import { Reminder } from '../models/Reminder';
import { DocumentType } from '../models/Document';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before expiry at which an owner is reminded. */
export const REMINDER_THRESHOLD_DAYS = [30, 7, 1];

interface ScheduleParams {
  documentId: Types.ObjectId | string;
  vehicleId: Types.ObjectId | string;
  ownerId: Types.ObjectId | string;
  expiryDate: Date;
  docType: DocumentType;
  verified: boolean;
}

/**
 * Replaces a document's unsent reminders. Thresholds still in the future are scheduled as usual.
 * If some have already passed (e.g. a document uploaded with 5 days left), they are NOT all sent
 * at once: a single reminder with the real days left is queued for now instead. An expired
 * document gets no reminders.
 */
export const scheduleDocumentReminders = async (
  { documentId, vehicleId, ownerId, expiryDate, docType, verified }: ScheduleParams,
  now: number = Date.now()
): Promise<number> => {
  await Reminder.deleteMany({ documentId, sent: false });

  const expiryMs = expiryDate.getTime();
  if (isNaN(expiryMs) || expiryMs <= now) return 0;

  const noun = verified ? 'verified certificate' : 'document';
  const build = (daysLeft: number, thresholdDays: number, scheduledFor: Date) => ({
    documentId,
    vehicleId,
    ownerId,
    scheduledFor,
    thresholdDays,
    channel: 'push' as const,
    message: `Your vehicle's ${docType.toUpperCase()} ${noun} expires in ${daysLeft} day(s). Tap to book a renewal slot.`,
    sent: false
  });

  const rows = [];
  const missed: number[] = [];
  for (const days of REMINDER_THRESHOLD_DAYS) {
    const at = expiryMs - days * DAY_MS;
    if (at > now) rows.push(build(days, days, new Date(at)));
    else missed.push(days);
  }

  if (missed.length > 0) {
    const daysLeft = Math.max(1, Math.ceil((expiryMs - now) / DAY_MS));
    rows.unshift(build(daysLeft, Math.min(...missed), new Date(now)));
  }

  await Reminder.insertMany(rows);
  return rows.length;
};
