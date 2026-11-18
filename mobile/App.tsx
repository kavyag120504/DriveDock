import React, { useEffect } from 'react';
import './src/utils/webAlerts'; // makes Alert.alert work in the browser
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Colors } from './src/theme/colors';
import { useResponsiveLayout } from './src/theme/responsive';
import Constants, { AppOwnership } from 'expo-constants';
import { Text } from 'react-native';

// Set per build (eas.json) so a pilot/test APK can never be mistaken for a live service
const BUILD_LABEL = process.env.EXPO_PUBLIC_BUILD_LABEL;

const queryClient = new QueryClient();

export default function App() {
  const { compact } = useResponsiveLayout();
  const visibleBuildLabel =
    compact && BUILD_LABEL?.includes('student pilot')
      ? 'Student pilot · synthetic data · test payments only'
      : BUILD_LABEL;
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
          {BUILD_LABEL ? (
            <Text
              accessibilityLabel={BUILD_LABEL}
              style={{
                paddingHorizontal: 8,
                backgroundColor: '#FEF3C7',
                color: '#92400E',
                fontSize: 11,
                fontWeight: '700',
                textAlign: 'center',
                paddingVertical: 3,
              }}
            >
              {visibleBuildLabel}
            </Text>
          ) : null}
          <RootNavigator />
        </SafeAreaView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
