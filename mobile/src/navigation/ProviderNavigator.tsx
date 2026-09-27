import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { Colors } from '../theme/colors';

import { TodayBookingsScreen } from '../screens/provider/TodayBookingsScreen';
import { CompleteBookingScreen } from '../screens/provider/CompleteBookingScreen';
import { ManageSlotsScreen } from '../screens/provider/ManageSlotsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const BookingsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="TodayBookings" component={TodayBookingsScreen} />
    <Stack.Screen name="CompleteBooking" component={CompleteBookingScreen} />
  </Stack.Navigator>
);

export const ProviderNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: Colors.provider,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tab.Screen
        name="OrdersTab"
        component={BookingsStack}
        options={{
          tabBarLabel: 'Inspections',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🔧</Text>
        }}
      />
      <Tab.Screen
        name="SlotsTab"
        component={ManageSlotsScreen}
        options={{
          tabBarLabel: 'Bays & Slots',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>⏱️</Text>
        }}
      />
    </Tab.Navigator>
  );
};
