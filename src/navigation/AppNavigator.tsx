import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Import screens (will create these next)
import Dashboard from '../screens/Dashboard';
import PhotoLibrary from '../screens/PhotoLibrary';
import Duplicates from '../screens/Duplicates';
import LargeFiles from '../screens/LargeFiles';
import Screenshots from '../screens/Screenshots';
import Settings from '../screens/Settings';
import Paywall from '../screens/Paywall';

// Define navigation types for type safety
export type RootStackParamList = {
  Dashboard: undefined;
  PhotoLibrary: undefined;
  Duplicates: undefined;
  LargeFiles: undefined;
  Screenshots: undefined;
  Settings: undefined;
  Paywall: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#3B82F6', // Blue header
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Dashboard"
          component={Dashboard}
          options={{ title: 'CleanSpace' }}
        />
        <Stack.Screen
          name="PhotoLibrary"
          component={PhotoLibrary}
          options={{ title: 'Photo Library' }}
        />
        <Stack.Screen
          name="Duplicates"
          component={Duplicates}
          options={{ title: 'Duplicate Photos' }}
        />
        <Stack.Screen
          name="LargeFiles"
          component={LargeFiles}
          options={{ title: 'Large Files' }}
        />
        <Stack.Screen
          name="Screenshots"
          component={Screenshots}
          options={{ title: 'Screenshots' }}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={{ title: 'Settings' }}
        />
        <Stack.Screen
          name="Paywall"
          component={Paywall}
          options={{
            title: 'Upgrade to Pro',
            presentation: 'modal', // Show as modal on iOS
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
