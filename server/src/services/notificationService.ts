import { ENV } from '../config/env';
import { User } from '../models/User';

export interface PushNotificationPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
}

/**
 * Sends one Expo push message (Expo relays it to Firebase Cloud Messaging on Android).
 * Returns true only when Expo accepted it. When Expo reports that the device is gone (DeviceNotRegistered: the app
 * was uninstalled or the token rotated) the stored token is cleared, so we stop sending to it.
 */
export const sendPushNotification = async (payload: PushNotificationPayload): Promise<boolean> => {
  if (!payload.to || !payload.to.startsWith('ExponentPushToken[')) {
    // Not an Expo push token, so nothing can be delivered; report failure so the reminder stays queued
    console.log(`[NotificationService] Skipped (not an Expo push token: ${payload.to || 'none'}):`, {
      title: payload.title,
      body: payload.body
    });
    return false;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (ENV.EXPO_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${ENV.EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: payload.to,
        sound: payload.sound || 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        channelId: 'default', // the Android channel the app creates; high priority wakes the device
        priority: 'high'
      })
    });

    const result: any = await response.json().catch(() => null);
    console.log('[NotificationService] Expo push result:', JSON.stringify(result));

    // Expo answers 200 even when it rejects a message (e.g. DeviceNotRegistered); the outcome is in
    // data.status ('ok' | 'error'). data is an object for one message, an array for a batch.
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
      await User.updateMany({ expoPushToken: payload.to }, { $set: { expoPushToken: '' } });
    }
    return response.ok && ticket?.status === 'ok';
  } catch (error) {
    console.error('[NotificationService] Push notification send error:', error);
    return false;
  }
};
