import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import './global.css';
import AppNavigator from './src/navigation/AppNavigator';
import { setupDatabase } from './src/database/setup';

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('[App] Initializing CleanSpace...');

      // Initialize database
      const dbResult = await setupDatabase();

      if (!dbResult.success) {
        throw new Error(dbResult.message);
      }

      console.log('[App] ✅ CleanSpace initialized successfully');
      setIsInitializing(false);
    } catch (error) {
      console.error('[App] ❌ Initialization failed:', error);
      setInitError(error instanceof Error ? error.message : 'Unknown error');
      setIsInitializing(false);
    }
  };

  // Show loading screen while initializing
  if (isInitializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="mt-4 text-gray-600 text-lg">Initializing CleanSpace...</Text>
        <Text className="mt-2 text-gray-400 text-sm">Setting up database</Text>
      </View>
    );
  }

  // Show error screen if initialization failed
  if (initError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-red-600 text-xl font-bold mb-2">Initialization Failed</Text>
        <Text className="text-gray-600 text-center mb-4">{initError}</Text>
        <Text className="text-gray-400 text-sm text-center">
          Please restart the app. If the problem persists, try reinstalling.
        </Text>
      </View>
    );
  }

  // Show main app once initialized
  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
