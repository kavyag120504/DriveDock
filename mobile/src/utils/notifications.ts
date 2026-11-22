import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';
import { AuthAPI } from '../api/endpoints';

// Classic Expo Go no longer ships the native modules expo-notifications needs on Android (removed in SDK 53), and
// even importing the package there throws before any try/catch can run (its topic-subscription module calls
// requireNativeModule() at load time). A development or standalone build (eas build) includes it, so only skip
// for Expo Go itself.
const inExpoGo = (): boolean => Constants.appOwnership === AppOwnership.Expo;

const warn = (message: string, error?: unknown) => {
  // Push is non-critical (the app works without it), but a silent failure is hard to debug in development.
  if (__DEV__) console.warn(`[push] ${message}`, error ?? '');
};

let handlerSet = false;

export async function registerPushToken(): Promise<void> {
  if (inExpoGo()) return;

  try {
    const Notifications = await import('expo-notifications');

    // Show a notification while the app is open, instead of dropping it silently.
    if (!handlerSet) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
      handlerSet = true;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'DriveDock Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1D4ED8',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      warn('notification permission was not granted');
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await AuthAPI.updatePushToken(tokenResult.data);
  } catch (error) {
    // Most often: the build has no Firebase google-services.json (see docs/PUSH_NOTIFICATIONS.md).
    warn('could not register for push notifications', error);
  }
}

/**
 * Calls `callback` when a push arrives while the app is open and when the user taps one. Returns an unsubscribe
 * function. Does nothing in Expo Go (see above).
 */
export async function onPushReceived(callback: () => void): Promise<() => void> {
  if (inExpoGo()) return () => {};
  try {
    const Notifications = await import('expo-notifications');
    const received = Notifications.addNotificationReceivedListener(callback);
    const tapped = Notifications.addNotificationResponseReceivedListener(callback);
    return () => { received.remove(); tapped.remove(); };
  } catch (error) {
    warn('could not listen for notifications', error);
    return () => {};
  }
}
