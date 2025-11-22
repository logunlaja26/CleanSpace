import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

type SettingsProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function Settings({ navigation }: SettingsProps) {
  // Mock settings state
  const [tier, setTier] = useState<'free' | 'pro'>('free');
  const [scansRemaining, setScansRemaining] = useState(2);
  const [cleanupRemaining, setCleanupRemaining] = useState(50);

  // Scanning preferences
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [scanOnCharging, setScanOnCharging] = useState(true);
  const [scanFrequency, setScanFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // Duplicate detection settings
  const [similarityThreshold, setSimilarityThreshold] = useState(85);
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [includeBurstPhotos, setIncludeBurstPhotos] = useState(true);

  // Cloud sync settings
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>('Never');

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Account & Subscription */}
      <View className="bg-white mt-4 mx-4 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">Account & Subscription</Text>
        </View>

        {/* Current Tier */}
        <View className="p-4 border-b border-gray-200">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-700">Current Plan</Text>
            <View className={`px-3 py-1 rounded-full ${tier === 'pro' ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <Text className={`font-bold ${tier === 'pro' ? 'text-white' : 'text-gray-700'}`}>
                {tier === 'pro' ? 'PRO' : 'FREE'}
              </Text>
            </View>
          </View>

          {tier === 'free' && (
            <>
              <Text className="text-sm text-gray-500 mb-3">
                {scansRemaining} scans remaining this month
              </Text>
              <Text className="text-sm text-gray-500 mb-3">
                {cleanupRemaining} photo cleanups remaining
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Paywall')}
                className="bg-blue-600 py-3 rounded-lg"
              >
                <Text className="text-white text-center font-bold">Upgrade to Pro</Text>
              </TouchableOpacity>
            </>
          )}

          {tier === 'pro' && (
            <TouchableOpacity className="bg-gray-200 py-3 rounded-lg">
              <Text className="text-gray-700 text-center font-semibold">Manage Subscription</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Scanning Preferences */}
      <View className="bg-white mt-4 mx-4 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">Scanning Preferences</Text>
        </View>

        {/* Auto-scan */}
        <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-gray-800 font-semibold mb-1">Auto-Scan</Text>
            <Text className="text-sm text-gray-500">
              Automatically scan for duplicates periodically
            </Text>
            {tier === 'free' && (
              <View className="bg-blue-100 px-2 py-1 rounded mt-1 self-start">
                <Text className="text-blue-700 text-xs font-bold">PRO ONLY</Text>
              </View>
            )}
          </View>
          <Switch
            value={autoScanEnabled}
            onValueChange={setAutoScanEnabled}
            disabled={tier === 'free'}
          />
        </View>

        {/* Scan Frequency */}
        {autoScanEnabled && tier === 'pro' && (
          <View className="p-4 border-b border-gray-200">
            <Text className="text-gray-800 font-semibold mb-3">Scan Frequency</Text>
            <View className="flex-row space-x-2">
              <TouchableOpacity
                onPress={() => setScanFrequency('daily')}
                className={`flex-1 py-2 rounded-lg ${scanFrequency === 'daily' ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <Text className={`text-center font-semibold ${scanFrequency === 'daily' ? 'text-white' : 'text-gray-700'}`}>
                  Daily
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScanFrequency('weekly')}
                className={`flex-1 py-2 rounded-lg ${scanFrequency === 'weekly' ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <Text className={`text-center font-semibold ${scanFrequency === 'weekly' ? 'text-white' : 'text-gray-700'}`}>
                  Weekly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setScanFrequency('monthly')}
                className={`flex-1 py-2 rounded-lg ${scanFrequency === 'monthly' ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <Text className={`text-center font-semibold ${scanFrequency === 'monthly' ? 'text-white' : 'text-gray-700'}`}>
                  Monthly
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Scan only when charging */}
        <View className="p-4 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-gray-800 font-semibold mb-1">Scan Only When Charging</Text>
            <Text className="text-sm text-gray-500">
              Preserve battery by scanning only when plugged in
            </Text>
          </View>
          <Switch value={scanOnCharging} onValueChange={setScanOnCharging} />
        </View>
      </View>

      {/* Duplicate Detection */}
      <View className="bg-white mt-4 mx-4 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">Duplicate Detection</Text>
        </View>

        {/* Similarity Threshold */}
        <View className="p-4 border-b border-gray-200">
          <Text className="text-gray-800 font-semibold mb-2">
            Similarity Threshold: {similarityThreshold}%
          </Text>
          <Text className="text-sm text-gray-500 mb-3">
            Lower values detect more potential duplicates but may include false positives
          </Text>
          {/* Simplified threshold selector */}
          <View className="flex-row space-x-2">
            {[70, 80, 85, 90, 95].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setSimilarityThreshold(value)}
                className={`flex-1 py-2 rounded-lg ${similarityThreshold === value ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <Text className={`text-center text-sm ${similarityThreshold === value ? 'text-white font-bold' : 'text-gray-700'}`}>
                  {value}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Include Screenshots */}
        <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-gray-800 font-semibold mb-1">Include Screenshots</Text>
            <Text className="text-sm text-gray-500">
              Detect duplicate screenshots
            </Text>
          </View>
          <Switch value={includeScreenshots} onValueChange={setIncludeScreenshots} />
        </View>

        {/* Include Burst Photos */}
        <View className="p-4 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-gray-800 font-semibold mb-1">Include Burst Photos</Text>
            <Text className="text-sm text-gray-500">
              Group burst photos taken within 2 seconds
            </Text>
          </View>
          <Switch value={includeBurstPhotos} onValueChange={setIncludeBurstPhotos} />
        </View>
      </View>

      {/* Cloud Sync */}
      <View className="bg-white mt-4 mx-4 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">Cloud Sync</Text>
        </View>

        {/* Enable Cloud Sync */}
        <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-gray-800 font-semibold mb-1">Enable Cloud Sync</Text>
            <Text className="text-sm text-gray-500">
              Sync preferences and duplicate decisions (not photos)
            </Text>
            {tier === 'free' && (
              <View className="bg-blue-100 px-2 py-1 rounded mt-1 self-start">
                <Text className="text-blue-700 text-xs font-bold">PRO ONLY</Text>
              </View>
            )}
          </View>
          <Switch
            value={cloudSyncEnabled}
            onValueChange={setCloudSyncEnabled}
            disabled={tier === 'free'}
          />
        </View>

        {/* Last Sync */}
        {cloudSyncEnabled && (
          <View className="p-4 border-b border-gray-200">
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-700">Last Sync</Text>
              <Text className="text-gray-500">{lastSync}</Text>
            </View>
          </View>
        )}

        {/* Sync Now Button */}
        {cloudSyncEnabled && (
          <View className="p-4">
            <TouchableOpacity className="bg-blue-600 py-3 rounded-lg">
              <Text className="text-white text-center font-semibold">Sync Now</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Storage Management */}
      <View className="bg-white mt-4 mx-4 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">Storage Management</Text>
        </View>

        <View className="p-4 border-b border-gray-200">
          <TouchableOpacity className="bg-gray-200 py-3 rounded-lg">
            <Text className="text-gray-700 text-center font-semibold">Clear Cache</Text>
          </TouchableOpacity>
        </View>

        <View className="p-4">
          <TouchableOpacity className="bg-red-100 py-3 rounded-lg">
            <Text className="text-red-600 text-center font-semibold">Reset Database</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 text-center mt-2">
            This will delete all scan history and duplicate groups
          </Text>
        </View>
      </View>

      {/* About */}
      <View className="bg-white mt-4 mx-4 mb-8 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">About</Text>
        </View>

        <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
          <Text className="text-gray-700">App Version</Text>
          <Text className="text-gray-500">1.0.0</Text>
        </View>

        <TouchableOpacity className="p-4 border-b border-gray-200">
          <Text className="text-blue-600">Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity className="p-4">
          <Text className="text-blue-600">Terms of Service</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
