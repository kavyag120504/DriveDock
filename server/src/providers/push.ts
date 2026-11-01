/**
 * PushProvider — wraps the existing Expo push service. Behaviour unchanged.
 * Phase 4 moves sends behind the BullMQ queue and adds DeviceNotRegistered cleanup.
 */

import { AdapterMode } from './types';
import { sendPushNotification, PushNotificationPayload } from '../services/notificationService';

export interface PushProvider {
  readonly mode: AdapterMode;
  send(payload: PushNotificationPayload): Promise<boolean>;
}

export class ExpoPushProvider implements PushProvider {
  readonly mode: AdapterMode = 'real'; // talks to the real Expo Push API

  send(payload: PushNotificationPayload): Promise<boolean> {
    return sendPushNotification(payload);
  }
}

/** In-memory push sink for dev/test; records what would have been sent. */
export class MockPushProvider implements PushProvider {
  readonly mode: AdapterMode = 'mock';
  readonly sent: PushNotificationPayload[] = [];
  async send(payload: PushNotificationPayload): Promise<boolean> {
    this.sent.push(payload);
    return payload.to?.startsWith('ExponentPushToken[') ?? false;
  }
}
