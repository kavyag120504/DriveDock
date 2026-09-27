import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { Colors } from '../theme/colors';

import { OwnerDashboardScreen } from '../screens/owner/OwnerDashboardScreen';
import { VehicleDetailScreen } from '../screens/owner/VehicleDetailScreen';
import { AddVehicleScreen } from '../screens/owner/AddVehicleScreen';
import { BookSlotScreen } from '../screens/owner/BookSlotScreen';
import { OwnerChallansScreen } from '../screens/owner/OwnerChallansScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DashboardMain" component={OwnerDashboardScreen} />
    <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
    <Stack.Screen name="AddVehicle" component={AddVehicleScreen} />
    <Stack.Screen name="BookSlot" component={BookSlotScreen} />
  </Stack.Navigator>
);

export const OwnerNavigator = () => {
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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardStack}
        options={{
          tabBarLabel: 'Passport',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🚗</Text>
        }}
      />
      <Tab.Screen
        name="AddVehicleTab"
        component={AddVehicleScreen}
        options={{
          tabBarLabel: '+ Vehicle',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>➕</Text>
        }}
      />
      <Tab.Screen
        name="BookSlotTab"
        component={BookSlotScreen}
        options={{
          tabBarLabel: 'Renewals',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>📅</Text>
        }}
      />
      <Tab.Screen
        name="Challans"
        component={OwnerChallansScreen}
        options={{
          tabBarLabel: 'e-Challans',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>📄</Text>
        }}
      />
    </Tab.Navigator>
  );
};
