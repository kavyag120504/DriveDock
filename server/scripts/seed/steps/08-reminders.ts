import mongoose from 'mongoose';
import { Reminder } from '../../../src/models/Reminder';
import { registerMany } from '../lib/registry';

interface ExpiringSoonInfo {
  docId:     mongoose.Types.ObjectId;
  vehicleId: mongoose.Types.ObjectId;
  ownerId:   mongoose.Types.ObjectId;
}

export async function seedReminders(
  runId:              string,
  expiringSoonDocs:   ExpiringSoonInfo[],
  dryRun:             boolean
): Promise<mongoose.Types.ObjectId[]> {

  if (dryRun) {
    console.log(`[DRY-RUN] Would create reminders for ${expiringSoonDocs.length} expiring-soon documents`);
    return [];
  }

  const reminderIds: mongoose.Types.ObjectId[] = [];

  for (const { docId, vehicleId, ownerId } of expiringSoonDocs) {
    // Create a 7-day reminder scheduled for now (so the reminder cron can pick it up)
    const reminder = await Reminder.create({
      documentId:   docId,
      vehicleId,
      ownerId,
      scheduledFor: new Date(Date.now() - 3600000), // 1 hour ago → due immediately
      channel:      'push',
      thresholdDays: 7,
      message:      'A vehicle document is expiring soon. Book a renewal with an approved provider.',
      sent:         false,
    });
    reminderIds.push(reminder._id as mongoose.Types.ObjectId);
  }

  await registerMany(runId, 'reminders', reminderIds);
  console.log(`[Reminders] Created ${reminderIds.length} pending reminders`);
  return reminderIds;
}
