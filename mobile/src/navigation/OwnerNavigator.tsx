import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

import { OwnerDashboardScreen }  from '../screens/owner/OwnerDashboardScreen';
import { VehicleDetailScreen }   from '../screens/owner/VehicleDetailScreen';
import { AddVehicleScreen }      from '../screens/owner/AddVehicleScreen';
import { BookSlotScreen }        from '../screens/owner/BookSlotScreen';
import { OwnerChallansScreen }   from '../screens/owner/OwnerChallansScreen';
import { StationMapScreen }      from '../screens/owner/StationMapScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DashboardMain"  component={OwnerDashboardScreen} />
    <Stack.Screen name="VehicleDetail"  component={VehicleDetailScreen} />
    <Stack.Screen name="AddVehicle"     component={AddVehicleScreen} />
    <Stack.Screen name="BookSlot"       component={BookSlotScreen} />
  </Stack.Navigator>
);

const StationsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="StationMap"  component={StationMapScreen} />
    <Stack.Screen name="BookSlot"    component={BookSlotScreen} />
  </Stack.Navigator>
);

export const OwnerNavigator = () => (
  <Tab.Navigator
    screenOptions={({route}) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: Colors.surface,
        borderTopColor: Colors.border,
        height: 62,
        paddingBottom: 8,
        paddingTop: 8,
      },
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
    })}
  >
    <Tab.Screen
      name="Dashboard"
      component={DashboardStack}
      options={{
        tabBarLabel: 'Passport',
        tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="StationsTab"
      component={StationsStack}
      options={{
        tabBarLabel: 'Stations',
        tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="AddVehicleTab"
      component={AddVehicleScreen}
      options={{
        tabBarLabel: 'Add Vehicle',
        tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="BookSlotTab"
      component={BookSlotScreen}
      options={{
        tabBarLabel: 'Renewals',
        tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="Challans"
      component={OwnerChallansScreen}
      options={{
        tabBarLabel: 'e-Challans',
        tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
      }}
    />
  </Tab.Navigator>
);
