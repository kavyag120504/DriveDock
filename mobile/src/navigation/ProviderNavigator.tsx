import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors } from '../theme/colors';
import { ProvidersAPI } from '../api/endpoints';

import { TodayBookingsScreen } from '../screens/provider/TodayBookingsScreen';
import { CompleteBookingScreen } from '../screens/provider/CompleteBookingScreen';
import { ManageSlotsScreen } from '../screens/provider/ManageSlotsScreen';
import { CentreProfileScreen, providerProfileKey } from '../screens/provider/CentreProfileScreen';
import { useAuthStore } from '../store/authStore';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const BookingsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="TodayBookings" component={TodayBookingsScreen} />
    <Stack.Screen name="CompleteBooking" component={CompleteBookingScreen} />
  </Stack.Navigator>
);

export const ProviderNavigator = () => {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: providerProfileKey(userId),
    queryFn: async () => (await ProvidersAPI.getProfile()).data.data
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.provider} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load your centre.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // A new provider must describe their centre (real location, services, bays) before anything else
  if (profile && !profile.profileCompleted) {
    return <CentreProfileScreen />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border
        },
        tabBarActiveTintColor: Colors.provider,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tab.Screen
        name="OrdersTab"
        component={BookingsStack}
        options={{ tabBarLabel: 'Inspections' }}
      />
      <Tab.Screen
        name="SlotsTab"
        component={ManageSlotsScreen}
        options={{ tabBarLabel: 'Bays & Slots' }}
      />
      <Tab.Screen
        name="CentreTab"
        component={CentreProfileScreen}
        options={{ tabBarLabel: 'Centre' }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  errorText: { color: Colors.textSecondary, fontSize: 14 },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.provider
  },
  retryText: { color: Colors.provider, fontWeight: '700' }
});
