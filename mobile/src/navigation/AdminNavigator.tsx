import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { Colors } from '../theme/colors';

import { PendingProvidersScreen } from '../screens/admin/PendingProvidersScreen';
import { ProviderListScreen } from '../screens/admin/ProviderListScreen';
import { GovernmentOverviewScreen } from '../screens/government/GovernmentOverviewScreen';

const Tab = createBottomTabNavigator();

export const AdminNavigator = () => {
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
        tabBarActiveTintColor: Colors.admin,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tab.Screen
        name="PendingApprovals"
        component={PendingProvidersScreen}
        options={{
          tabBarLabel: 'Approvals',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🛡️</Text>
        }}
      />
      <Tab.Screen
        name="Stations"
        component={ProviderListScreen}
        options={{
          tabBarLabel: 'Stations',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🏢</Text>
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={GovernmentOverviewScreen}
        options={{
          tabBarLabel: 'System Stats',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>📊</Text>
        }}
      />
    </Tab.Navigator>
  );
};
