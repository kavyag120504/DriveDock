import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../theme/colors';

import { AuthNavigator } from './AuthNavigator';
import { OwnerNavigator } from './OwnerNavigator';
import { ProviderNavigator } from './ProviderNavigator';
import { OfficerNavigator } from './OfficerNavigator';
import { GovernmentNavigator } from './GovernmentNavigator';
import { AdminNavigator } from './AdminNavigator';

export const RootNavigator = () => {
  const { isAuthenticated, role, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
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
    alignItems: 'center'
  }
});
