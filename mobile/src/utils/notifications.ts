import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';
import { AuthAPI } from '../api/endpoints';

export async function registerPushToken(): Promise<void> {
  // Classic Expo Go no longer ships the native modules expo-notifications needs on
  // Android (removed in SDK 53) — even importing the package there throws, before any
  // try/catch below can run, because its topic-subscription module calls
  // requireNativeModule() at module load time. A dev-client/standalone build (built via
  // `eas build --profile development`) DOES include it, so only skip for Expo Go itself.
  if (Constants.appOwnership === AppOwnership.Expo) return;

  try {
    const Notifications = await import('expo-notifications');

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

    if (finalStatus !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await AuthAPI.updatePushToken(tokenResult.data);
  } catch {
    // Non-critical — app works fine without push tokens
  }
}
