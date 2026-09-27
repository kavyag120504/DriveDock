import { ENV } from '../config/env';

export interface PushNotificationPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
}

export const sendPushNotification = async (payload: PushNotificationPayload): Promise<boolean> => {
  if (!payload.to || !payload.to.startsWith('ExponentPushToken[')) {
    console.log(`[NotificationService] Mock dispatch (token not standard Expo token: ${payload.to}):`, {
      title: payload.title,
      body: payload.body
    });
    return true;
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
        data: payload.data || {}
      })
    });

    const result = await response.json();
    console.log('[NotificationService] Expo push result:', result);
    return true;
  } catch (error) {
    console.error('[NotificationService] Push notification send error:', error);
    return false;
  }
};
