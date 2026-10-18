import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
          borderTopColor: Colors.border
        },
        tabBarActiveTintColor: Colors.government,
        tabBarInactiveTintColor: Colors.textMuted
      }}
    >
      <Tab.Screen
        name="Overview"
        component={GovernmentOverviewScreen}
        options={{ tabBarLabel: 'National Index' }}
      />
      <Tab.Screen
        name="Regions"
        component={RegionMapScreen}
        options={{ tabBarLabel: 'Districts' }}
      />
      <Tab.Screen
        name="Trends"
        component={DocumentTrendsScreen}
        options={{ tabBarLabel: 'Audit Trends' }}
      />
    </Tab.Navigator>
  );
};
