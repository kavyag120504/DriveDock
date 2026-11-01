import React, { useEffect } from 'react';
import './src/utils/webAlerts'; // makes Alert.alert work in the browser
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Colors } from './src/theme/colors';
import Constants, { AppOwnership } from 'expo-constants';

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    // Classic Expo Go doesn't ship the native modules expo-notifications needs on
    // Android (removed in SDK 53) — statically importing the package at module scope
    // throws immediately on app launch there, so it's deferred to this effect and
    // skipped entirely in Expo Go. A dev-client/standalone build still gets the
    // real notification handler.
    if (Constants.appOwnership === AppOwnership.Expo) return;

    import('expo-notifications').then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    });
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        {/* Keeps every screen clear of the status bar, notch and Dynamic Island */}
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.surface }}>
          <RootNavigator />
        </SafeAreaView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
