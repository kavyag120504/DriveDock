import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { providers } from '../providers';

export interface NotifyInput {
  title: string;
  body: string;
  kind: string;
  /** Small, non-personal context used by the app to open the right screen (ids only, never names or numbers). */
  data?: Record<string, string>;
}

/**
 * Tells a user something happened: stores it in their in-app inbox, then sends a push if the device registered a
 * token. It never throws: a failed push or inbox write must not fail the request that caused the event.
 * Returns whether a push was accepted.
 */
export const notifyUser = async (userId: Types.ObjectId | string | null | undefined, input: NotifyInput): Promise<boolean> => {
  if (!userId) return false;
  try {
    await Notification.create({ userId, title: input.title, body: input.body, kind: input.kind, data: input.data ?? {} });
    const user = await User.findById(userId).select('expoPushToken').lean();
    if (!user?.expoPushToken) return false;
    return await providers.push.send({
      to: user.expoPushToken,
      title: input.title,
      body: input.body,
      data: { kind: input.kind, ...(input.data ?? {}) }
    });
  } catch (error) {
    console.error('[notify] could not notify user:', (error as Error)?.message);
    return false;
  }
};
