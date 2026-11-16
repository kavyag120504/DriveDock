import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabLabel } from '../components/TabLabel';
import { Colors } from '../theme/colors';
import { useResponsiveLayout } from '../theme/responsive';

import { BuyCarScreen } from '../features/twin/BuyCarScreen';
import { ShareTwinScreen } from '../features/twin/ShareTwinScreen';
import { TransferChecklistScreen } from '../features/twin/TransferChecklistScreen';
import { TransferOwnershipScreen } from '../features/twin/TransferOwnershipScreen';
import { VehicleTwinScreen } from '../features/twin/VehicleTwinScreen';
import { AddVehicleScreen } from '../screens/owner/AddVehicleScreen';
import { BookSlotScreen } from '../screens/owner/BookSlotScreen';
import { OwnerChallansScreen } from '../screens/owner/OwnerChallansScreen';
import { OwnerDashboardScreen } from '../screens/owner/OwnerDashboardScreen';
import { StationMapScreen } from '../screens/owner/StationMapScreen';
import { VehicleDetailScreen } from '../screens/owner/VehicleDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DashboardMain" component={OwnerDashboardScreen} />
    <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} />
    <Stack.Screen name="AddVehicle" component={AddVehicleScreen} />
    <Stack.Screen name="BookSlot" component={BookSlotScreen} />
    <Stack.Screen name="VehicleTwin" component={VehicleTwinScreen} />
    <Stack.Screen name="TransferOwnership" component={TransferOwnershipScreen} />
    <Stack.Screen name="TransferChecklist" component={TransferChecklistScreen} />
    <Stack.Screen name="ShareTwin" component={ShareTwinScreen} />
  </Stack.Navigator>
);

// Add Vehicle covers both ways a car joins your passport: registering one you own,
// or buying a used one from another DriveDock owner
const AddVehicleStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AddVehicleMain" component={AddVehicleScreen} />
    <Stack.Screen name="BuyCar" component={BuyCarScreen} />
  </Stack.Navigator>
);

const StationsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="StationMap" component={StationMapScreen} />
    <Stack.Screen name="BookSlot" component={BookSlotScreen} />
  </Stack.Navigator>
);

export const OwnerNavigator = () => {
  const insets = useSafeAreaInsets();
  const { tabHeight } = useResponsiveLayout();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          height: tabHeight + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopColor: Colors.border,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { paddingVertical: 0 },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardStack}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />,
          tabBarAccessibilityLabel: 'Vehicle passport',
          tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="StationsTab"
        component={StationsStack}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Map" color={color} />,
          tabBarAccessibilityLabel: 'Find service stations',
          tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="AddVehicleTab"
        component={AddVehicleStack}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Add" color={color} />,
          tabBarAccessibilityLabel: 'Add vehicle',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="BookSlotTab"
        component={BookSlotScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Renew" color={color} />,
          tabBarAccessibilityLabel: 'Book document renewals',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Challans"
        component={OwnerChallansScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Fines" color={color} />,
          tabBarAccessibilityLabel: 'View e-challans',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
