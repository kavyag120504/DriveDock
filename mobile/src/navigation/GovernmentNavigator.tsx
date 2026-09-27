import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { Colors } from '../theme/colors';

import { GovernmentOverviewScreen } from '../screens/government/GovernmentOverviewScreen';
import { RegionMapScreen } from '../screens/government/RegionMapScreen';
import { DocumentTrendsScreen } from '../screens/government/DocumentTrendsScreen';

const Tab = createBottomTabNavigator();

export const GovernmentNavigator = () => {
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
        tabBarActiveTintColor: Colors.government,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tab.Screen
        name="Overview"
        component={GovernmentOverviewScreen}
        options={{
          tabBarLabel: 'National Index',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>📊</Text>
        }}
      />
      <Tab.Screen
        name="Regions"
        component={RegionMapScreen}
        options={{
          tabBarLabel: 'Districts',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🗺️</Text>
        }}
      />
      <Tab.Screen
        name="Trends"
        component={DocumentTrendsScreen}
        options={{
          tabBarLabel: 'Audit Trends',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>📈</Text>
        }}
      />
    </Tab.Navigator>
  );
};
