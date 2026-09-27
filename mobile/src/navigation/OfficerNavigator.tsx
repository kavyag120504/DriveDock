import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScanQRScreen } from '../screens/officer/ScanQRScreen';
import { VehicleStatusScreen } from '../screens/officer/VehicleStatusScreen';
import { LogViolationScreen } from '../screens/officer/LogViolationScreen';

const Stack = createNativeStackNavigator();

export const OfficerNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ScanQR" component={ScanQRScreen} />
      <Stack.Screen name="VehicleStatus" component={VehicleStatusScreen} />
      <Stack.Screen name="LogViolation" component={LogViolationScreen} />
    </Stack.Navigator>
  );
};
