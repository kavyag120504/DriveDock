import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../theme/colors';

import { AdminNavigator } from './AdminNavigator';
import { AuthNavigator } from './AuthNavigator';
import { GovernmentNavigator } from './GovernmentNavigator';
import { OfficerNavigator } from './OfficerNavigator';
import { OwnerNavigator } from './OwnerNavigator';
import { ProviderNavigator } from './ProviderNavigator';

export const RootNavigator = () => {
  const { isAuthenticated, role, checkAuth } = useAuthStore();

  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    checkAuth().finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: Colors.primary,
          background: Colors.background,
          card: Colors.surface,
          text: Colors.textPrimary,
          border: Colors.border,
        },
      }}
    >
      {!isAuthenticated || !role ? (
        <AuthNavigator />
      ) : role === 'owner' ? (
        <OwnerNavigator />
      ) : role === 'provider' ? (
        <ProviderNavigator />
      ) : role === 'officer' ? (
        <OfficerNavigator />
      ) : role === 'government' ? (
        <GovernmentNavigator />
      ) : role === 'admin' ? (
        <AdminNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
