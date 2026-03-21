import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, Linking } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState } from '../components';

// Database queries and services
import * as PreferenceQueries from '../database/queries/preferences';
import { UsageManager } from '../services/UsageManager';
import { SyncService } from '../services/SyncService';
import { runFullDiagnostics } from '../utils/diagnostics';
import { backfillFileSizes } from '../services/BackfillFileSizes';
import { subscriptionManager } from '../services/SubscriptionManager';
import { UserTier } from '../database/queries/usage';

type SettingsProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function Settings({ navigation }: SettingsProps) {
  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Account state
  const [tier, setTier] = useState<'free' | 'pro'>('free');
  const [scansRemaining, setScansRemaining] = useState(0);
  const [cleanupRemaining, setCleanupRemaining] = useState(0);

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

  /**
   * Load all settings from database
   */
  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load usage limits and tier
      const usageManager = new UsageManager();
      const usage = await usageManager.getRemainingUsage();
      setTier(usage.tier === 'pro' ? 'pro' : 'free');
      setScansRemaining(usage.scansRemaining);
      setCleanupRemaining(usage.cleanupsRemaining);

      // Load preferences
      const prefs = await PreferenceQueries.getAllPreferences();

      // Scanning preferences
      setAutoScanEnabled(Number(prefs.auto_scan_enabled) === 1);
      setScanOnCharging(Number(prefs.scan_only_when_charging) === 1);
      setScanFrequency((prefs.scan_frequency as 'daily' | 'weekly' | 'monthly') || 'weekly');

      // Duplicate detection settings
      setSimilarityThreshold(Number(prefs.similarity_threshold) || 85);
      setIncludeScreenshots(Number(prefs.include_screenshots_in_scan) === 1);
      setIncludeBurstPhotos(Number(prefs.include_burst_photos_in_scan) === 1);

      // Cloud sync settings
      setCloudSyncEnabled(Number(prefs.cloud_sync_enabled) === 1);
      setLastSync(prefs.last_sync_time ? formatTimeAgo(String(prefs.last_sync_time)) : 'Never');

    } catch (err) {
      console.error('Error loading settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Save a preference to database
   */
  const savePreference = async (key: string, value: string | number) => {
    try {
      await PreferenceQueries.setPreference(key, value.toString());
    } catch (err) {
      console.error(`Error saving preference ${key}:`, err);
      Alert.alert('Error', 'Failed to save preference. Please try again.');
    }
  };

  /**
   * Toggle auto-scan with Pro check
   */
  const handleAutoScanToggle = async (value: boolean) => {
    if (value && tier === 'free') {
      Alert.alert(
        'Pro Feature',
        'Auto-scan is a Pro feature. Upgrade to enable automatic scanning.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
        ]
      );
      return;
    }
    setAutoScanEnabled(value);
    await savePreference('auto_scan_enabled', value ? 1 : 0);
  };

  /**
   * Toggle cloud sync with Pro check
   */
  const handleCloudSyncToggle = async (value: boolean) => {
    if (value && tier === 'free') {
      Alert.alert(
        'Pro Feature',
        'Cloud sync is a Pro feature. Upgrade to sync your preferences across devices.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
        ]
      );
      return;
    }
    setCloudSyncEnabled(value);
    await savePreference('cloud_sync_enabled', value ? 1 : 0);
  };

  /**
   * Trigger manual sync
   */
  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      const syncService = new SyncService();
      await syncService.startSync();

      // Update last sync time
      const now = new Date().toISOString();
      await savePreference('last_sync_time', now);
      setLastSync('Just now');

      Alert.alert('Success', 'Settings synced successfully!');
    } catch (err) {
      console.error('Error syncing:', err);
      Alert.alert('Sync Failed', 'Could not sync settings. Please check your connection and try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Clear app cache
   */
  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will clear temporary photo thumbnails. Your scan data and settings will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            // TODO: Implement cache clearing logic
            Alert.alert('Success', 'Cache cleared successfully!');
          },
        },
      ]
    );
  };

  /**
   * Reset database (danger zone)
   */
  const handleResetDatabase = async () => {
    Alert.alert(
      'Reset Database',
      'This will delete ALL scan history, duplicate groups, and photo data. This cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Implement database reset logic
              // This should clear photos, hashes, duplicate groups, scan history
              // but preserve user preferences and usage limits
              Alert.alert('Success', 'Database reset successfully!');
              loadSettings(); // Reload settings
            } catch (err) {
              console.error('Error resetting database:', err);
              Alert.alert('Error', 'Failed to reset database. Please try again.');
            }
          },
        },
      ]
    );
  };

  /**
   * Open iOS subscription management
   * Required by Apple - apps cannot cancel subscriptions programmatically
   */
  const handleManageSubscription = async () => {
    try {
      // Deep link to iOS subscription management
      const url = 'https://apps.apple.com/account/subscriptions';

      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        // Fallback for older iOS versions or if link doesn't open
        Alert.alert(
          'Manage Subscription',
          'To manage your subscription:\n\n1. Open Settings app\n2. Tap your Apple ID at the top\n3. Tap Subscriptions\n4. Select CleanSpace',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[Settings] Error opening subscription management:', error);
      Alert.alert(
        'Unable to Open Settings',
        'Please go to:\nSettings → Apple ID → Subscriptions → CleanSpace',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Backfill file sizes for existing photos/videos
   */
  const handleBackfillFileSizes = async () => {
    Alert.alert(
      'Update File Sizes',
      'This will scan your existing photos and videos to add file size information. This may take a few minutes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              setIsLoading(true);
              const result = await backfillFileSizes((current, total) => {
                console.log(`[Settings] Backfill progress: ${current}/${total}`);
              });

              Alert.alert(
                'File Sizes Updated',
                `Updated ${result.photosUpdated} photos and ${result.videosUpdated} videos!\n\n` +
                `Failed: ${result.photosFailed} photos, ${result.videosFailed} videos\n` +
                `Total size: ${(result.totalSize / (1024 * 1024)).toFixed(1)} MB`
              );
            } catch (err) {
              console.error('Error backfilling file sizes:', err);
              Alert.alert('Error', 'Failed to update file sizes. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  /**
   * Run video diagnostics
   */
  const handleRunDiagnostics = async () => {
    try {
      Alert.alert(
        'Running Diagnostics',
        'Checking video support and database status...\n\nCheck the Metro console for detailed output.',
        [{ text: 'OK' }]
      );

      const results = await runFullDiagnostics();

      // Build summary message
      let message = '';

      if (results.video) {
        message += `Videos Table: ${results.video.tableExists ? '✓ Exists' : '✗ Missing'}\n`;
        message += `Videos in DB: ${results.video.videoCount}\n`;
        message += `Photos in DB: ${results.video.photoCount}\n`;
        message += `Videos on Device: ${results.video.deviceVideoCount}\n\n`;

        message += 'Recommendations:\n';
        results.video.recommendations.forEach((rec, i) => {
          message += `${i + 1}. ${rec}\n`;
        });
      }

      Alert.alert('Diagnostics Complete', message, [{ text: 'OK' }]);

      console.log('Full diagnostic results:', results);
    } catch (error) {
      Alert.alert(
        'Diagnostics Failed',
        error instanceof Error ? error.message : 'Unknown error',
        [{ text: 'OK' }]
      );
    }
  };

  // Load settings on mount
  useEffect(() => {
    loadSettings();

    // Listen for subscription status changes from RevenueCat
    subscriptionManager.onSubscriptionUpdate((newTier: UserTier) => {
      console.log('[Settings] Subscription updated:', newTier);

      // Update tier immediately
      setTier(newTier === UserTier.PRO ? 'pro' : 'free');

      // Reload all settings to refresh usage limits
      loadSettings();
    });
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [])
  );

  /**
   * Format timestamp to relative time
   */
  const formatTimeAgo = (timestamp: string): string => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading settings..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Settings"
          message={error}
          onRetry={loadSettings}
        />
      </View>
    );
  }

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
            <TouchableOpacity
              className="bg-gray-200 py-3 rounded-lg"
              onPress={handleManageSubscription}
            >
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
            onValueChange={handleAutoScanToggle}
            disabled={tier === 'free'}
          />
        </View>

        {/* Scan Frequency */}
        {autoScanEnabled && tier === 'pro' && (
          <View className="p-4 border-b border-gray-200">
            <Text className="text-gray-800 font-semibold mb-3">Scan Frequency</Text>
            <View className="flex-row space-x-2">
              <TouchableOpacity
                onPress={async () => {
                  setScanFrequency('daily');
                  await savePreference('scan_frequency', 'daily');
                }}
                className={`flex-1 py-2 rounded-lg ${scanFrequency === 'daily' ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <Text className={`text-center font-semibold ${scanFrequency === 'daily' ? 'text-white' : 'text-gray-700'}`}>
                  Daily
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  setScanFrequency('weekly');
                  await savePreference('scan_frequency', 'weekly');
                }}
                className={`flex-1 py-2 rounded-lg ${scanFrequency === 'weekly' ? 'bg-blue-600' : 'bg-gray-200'}`}
              >
                <Text className={`text-center font-semibold ${scanFrequency === 'weekly' ? 'text-white' : 'text-gray-700'}`}>
                  Weekly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  setScanFrequency('monthly');
                  await savePreference('scan_frequency', 'monthly');
                }}
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
          <Switch
            value={scanOnCharging}
            onValueChange={async (value) => {
              setScanOnCharging(value);
              await savePreference('scan_only_when_charging', value ? 1 : 0);
            }}
          />
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
                onPress={async () => {
                  setSimilarityThreshold(value);
                  await savePreference('similarity_threshold', value);
                }}
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
          <Switch
            value={includeScreenshots}
            onValueChange={async (value) => {
              setIncludeScreenshots(value);
              await savePreference('include_screenshots_in_scan', value ? 1 : 0);
            }}
          />
        </View>

        {/* Include Burst Photos */}
        <View className="p-4 flex-row justify-between items-center">
          <View className="flex-1 pr-4">
            <Text className="text-gray-800 font-semibold mb-1">Include Burst Photos</Text>
            <Text className="text-sm text-gray-500">
              Group burst photos taken within 2 seconds
            </Text>
          </View>
          <Switch
            value={includeBurstPhotos}
            onValueChange={async (value) => {
              setIncludeBurstPhotos(value);
              await savePreference('include_burst_photos_in_scan', value ? 1 : 0);
            }}
          />
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
            onValueChange={handleCloudSyncToggle}
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
            <TouchableOpacity
              className="bg-blue-600 py-3 rounded-lg"
              onPress={handleSyncNow}
              disabled={isSyncing}
            >
              <Text className="text-white text-center font-semibold">
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Storage Management */}
      {/* <View className="bg-white mt-4 mx-4 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">Storage Management</Text>
        </View>

        <View className="p-4 border-b border-gray-200">
          <TouchableOpacity
            className="bg-gray-200 py-3 rounded-lg"
            onPress={handleClearCache}
          >
            <Text className="text-gray-700 text-center font-semibold">Clear Cache</Text>
          </TouchableOpacity>
        </View>

        <View className="p-4 border-b border-gray-200">
          <TouchableOpacity
            className="bg-green-100 py-3 rounded-lg"
            onPress={handleBackfillFileSizes}
          >
            <Text className="text-green-700 text-center font-semibold">Update File Sizes</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 text-center mt-2">
            Fix missing file size badges for existing photos/videos
          </Text>
        </View>

        <View className="p-4 border-b border-gray-200">
          <TouchableOpacity
            className="bg-blue-100 py-3 rounded-lg"
            onPress={handleRunDiagnostics}
          >
            <Text className="text-blue-700 text-center font-semibold">Run Video Diagnostics</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 text-center mt-2">
            Check video support and database status
          </Text>
        </View>

        <View className="p-4">
          <TouchableOpacity
            className="bg-red-100 py-3 rounded-lg"
            onPress={handleResetDatabase}
          >
            <Text className="text-red-600 text-center font-semibold">Reset Database</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-500 text-center mt-2">
            This will delete all scan history and duplicate groups
          </Text>
        </View>
      </View> */}

      {/* About */}
      <View className="bg-white mt-4 mx-4 mb-8 rounded-xl shadow-sm overflow-hidden">
        <View className="p-4 border-b border-gray-200">
          <Text className="font-bold text-lg text-gray-800">About</Text>
        </View>

        <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
          <Text className="text-gray-700">App Version</Text>
          <Text className="text-gray-500">1.0.0</Text>
        </View>

        <TouchableOpacity
          className="p-4 border-b border-gray-200"
          onPress={() => Linking.openURL('https://verdant-nougat-01b352.netlify.app/privacy')}
        >
          <Text className="text-blue-600">Privacy Policy</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="p-4 border-b border-gray-200"
          onPress={() => Linking.openURL('https://verdant-nougat-01b352.netlify.app/terms')}
        >
          <Text className="text-blue-600">Terms of Service</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
