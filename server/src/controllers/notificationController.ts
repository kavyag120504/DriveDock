import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { Notification } from '../models/Notification';

/** GET /notifications: the caller's own inbox, newest first, with the unread count. */
export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '30'), 10) || 30, 1), 100);
    const [items, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ userId, readAt: null })
    ]);
    res.status(200).json({ success: true, data: { items, unreadCount } });
  } catch {
    res.status(500).json({ success: false, message: 'Could not load notifications' });
  }
};

/** POST /notifications/read: marks the given ids (or everything, when no ids are sent) as read. Own entries only. */
export const markNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const ids: unknown = req.body?.ids;
    const filter: Record<string, unknown> = { userId, readAt: null };
    if (ids !== undefined) {
      if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === 'string' && isValidObjectId(i))) {
        res.status(400).json({ success: false, message: 'ids must be a list of notification ids' });
        return;
      }
      filter._id = { $in: ids };
    }
    const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    res.status(200).json({ success: true, data: { updated: result.modifiedCount } });
  } catch {
    res.status(500).json({ success: false, message: 'Could not update notifications' });
  }
};
