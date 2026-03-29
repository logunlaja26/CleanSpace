import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Button, Badge, SavingsBadge, LoadingSpinner, ErrorState } from '../components';
import { colors, spacing, typography, layout } from '../theme';

// Services
import { StorageAnalytics } from '../services/StorageAnalytics';
import { UsageManager } from '../services/UsageManager';
import { PhotoScanner, ScanType } from '../services/PhotoScanner';
import { DuplicateDetector } from '../services/DuplicateDetector';
import * as PhotoQueries from '../database/queries/photos';
import * as DuplicateQueries from '../database/queries/duplicates';
import * as ScanHistoryQueries from '../database/queries/scanHistory';

type DashboardProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

// Dashboard data type
interface DashboardData {
  totalPhotos: number;
  totalVideos: number;
  totalMedia: number;
  totalSize: string;
  freeSpace: string;
  duplicateGroups: number;
  potentialSavings: string;
  largeFilesCount: number;
  screenshotsCount: number;
  lastScan: string;
  scansRemaining: number;
  cleanupRemaining: number;
  tier: 'free' | 'pro';
}

export default function Dashboard({ navigation }: DashboardProps) {
  // State management
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalPhotos: 0,
    totalVideos: 0,
    totalMedia: 0,
    totalSize: '0 GB',
    freeSpace: '0 GB',
    duplicateGroups: 0,
    potentialSavings: '0 GB',
    largeFilesCount: 0,
    screenshotsCount: 0,
    lastScan: 'Never',
    scansRemaining: 0,
    cleanupRemaining: 0,
    tier: 'free',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  /**
   * Fetch all dashboard data from services and database
   * This is our main data loading function
   */
  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Initialize services
      const storageAnalytics = new StorageAnalytics();
      const usageManager = new UsageManager();

      // Fetch all data in parallel for better performance
      const [
        storageData,
        duplicateGroups,
        largeFiles,
        screenshots,
        usageLimits,
        lastScanRecord,
      ] = await Promise.all([
        storageAnalytics.getStorageBreakdown(),
        DuplicateQueries.getDuplicateGroups(),
        PhotoQueries.getLargeFiles(5 * 1024 * 1024), // Files > 5MB
        PhotoQueries.getScreenshots(),
        usageManager.getRemainingUsage(),
        ScanHistoryQueries.getLastScan(),
      ]);

      // Calculate potential savings
      const savings = await storageAnalytics.estimateSavings();

      // Format the data for the UI
      const totalMedia = storageData.photoCount + storageData.videoCount + storageData.screenshotCount;

      setDashboardData({
        totalPhotos: storageData.photoCount,
        totalVideos: storageData.videoCount,
        totalMedia: totalMedia,
        totalSize: formatBytes(storageData.totalSize),
        freeSpace: '0 GB', // TODO: Get from device storage API
        duplicateGroups: duplicateGroups.length,
        potentialSavings: formatBytes(savings),
        largeFilesCount: largeFiles.length,
        screenshotsCount: screenshots.length,
        lastScan: lastScanRecord ? formatTimeAgo(lastScanRecord.created_at) : 'Never',
        scansRemaining: usageLimits.scansRemaining,
        cleanupRemaining: usageLimits.cleanupsRemaining,
        tier: usageLimits.tier === 'pro' ? 'pro' : 'free',
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle scan button press - connects to PhotoScanner service
   */
  const handleStartScan = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Check usage limits first
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canPerformScan();

      if (!allowed) {
        Alert.alert(
          'Scan Limit Reached',
          `You've used all your scans this month. ${dashboardData.tier === 'free' ? 'Upgrade to Pro for unlimited scans!' : ''}`,
          [
            { text: 'OK', style: 'cancel' },
            ...(dashboardData.tier === 'free'
              ? [{ text: 'Upgrade', onPress: () => navigation.navigate('Paywall') }]
              : []
            ),
          ]
        );
        return;
      }

      setIsScanning(true);

      // Initialize and start the scanner
      const scanner = new PhotoScanner();

      // Start the scan (photos & videos)
      const result = await scanner.startScan(ScanType.FULL);

      // Record the scan
      await usageManager.recordScan();

      // Run duplicate detection after scan completes
      console.log('[Dashboard] Running duplicate detection...');
      const duplicateDetector = new DuplicateDetector();
      const duplicateResult = await duplicateDetector.detectAllDuplicates();
      console.log(`[Dashboard] Found ${duplicateResult.groupsCreated} duplicate groups, ${formatBytes(duplicateResult.totalSavings)} potential savings`);

      // Reload dashboard data to reflect new scan results and duplicate groups
      await loadDashboardData();

      // Show comprehensive success message
      const mediaMessage = [
        result.photosScanned > 0 ? `${result.photosScanned} photos` : null,
        result.videosScanned > 0 ? `${result.videosScanned} videos` : null,
      ].filter(Boolean).join(' and ');

      const duplicateMessage = duplicateResult.groupsCreated > 0
        ? `\n\nFound ${duplicateResult.groupsCreated} duplicate group${duplicateResult.groupsCreated > 1 ? 's' : ''} with ${formatBytes(duplicateResult.totalSavings)} potential savings!`
        : '\n\nNo duplicates found.';

      Alert.alert(
        'Scan Complete!',
        `Scanned ${mediaMessage} in ${Math.round(result.duration / 1000)}s.${duplicateMessage}`,
        [{ text: 'OK' }]
      );

    } catch (err) {
      console.error('Error during scan:', err);
      Alert.alert(
        'Scan Failed',
        err instanceof Error ? err.message : 'An error occurred during scanning',
        [{ text: 'OK' }]
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleQuickAction = async (screen: keyof RootStackParamList) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(screen as any);
  };

  // Load dashboard data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Reload data when screen comes into focus (e.g., returning from other screens)
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center p-6">
        <View className="bg-white p-8 rounded-2xl shadow-lg">
          <LoadingSpinner size="large" label="Loading your dashboard..." />
        </View>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50 p-6">
        <View className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <ErrorState
            title="Failed to Load Dashboard"
            message={error}
            onRetry={loadDashboardData}
          />
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* DEV ONLY: Development Controls */}
      {__DEV__ && (
        <View className="bg-yellow-400 m-4 p-5 rounded-2xl border-2 border-yellow-500 shadow-lg">
          <View className="flex-row items-center justify-center mb-4">
            <View className="bg-yellow-500 p-2 rounded-lg mr-2">
              <MaterialCommunityIcons name="hammer-wrench" size={20} color="white" />
            </View>
            <Text style={[typography.label.large, { color: '#78350f', fontWeight: 'bold', fontSize: 16 }]}>
              DEVELOPER CONTROLS
            </Text>
          </View>
          <View className="flex-row justify-between gap-2">
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const usageManager = new UsageManager();
                await usageManager.devResetUsage();
                await loadDashboardData();
                Alert.alert('✅ Dev Reset', 'Usage counters have been reset!');
              }}
              className="flex-1 bg-red-600 p-3 rounded-xl shadow-md"
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-center">
                <MaterialIcons name="refresh" size={14} color="white" />
                <Text style={[typography.button.default, { color: 'white', textAlign: 'center', fontSize: 11, fontWeight: 'bold', marginLeft: 4 }]}>
                  Reset
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const usageManager = new UsageManager();
                await usageManager.devSetPro();
                await loadDashboardData();
                Alert.alert('✅ Dev Pro', 'Set to PRO tier (unlimited scans)');
              }}
              className="flex-1 bg-purple-600 p-3 rounded-xl shadow-md"
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-center">
                <Ionicons name="star" size={14} color="white" />
                <Text style={[typography.button.default, { color: 'white', textAlign: 'center', fontSize: 11, fontWeight: 'bold', marginLeft: 4 }]}>
                  PRO
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                const usageManager = new UsageManager();
                await usageManager.devSetFree();
                await loadDashboardData();
                Alert.alert('✅ Dev Free', 'Set to FREE tier with reset counters');
              }}
              className="flex-1 bg-gray-600 p-3 rounded-xl shadow-md"
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-center">
                <MaterialCommunityIcons name="account" size={14} color="white" />
                <Text style={[typography.button.default, { color: 'white', textAlign: 'center', fontSize: 11, fontWeight: 'bold', marginLeft: 4 }]}>
                  FREE
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Free Tier Usage Banner */}
      {dashboardData.tier === 'free' && (
        <TouchableOpacity
          onPress={() => handleQuickAction('Paywall')}
          className="bg-blue-600 p-5 m-4 rounded-2xl shadow-lg border border-blue-500"
          style={{
            shadowColor: '#2563eb',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center justify-center mb-2">
            <Ionicons name="information-circle" size={24} color="white" />
            <Text className="text-white font-bold text-center text-lg ml-2">
              Free Plan
            </Text>
          </View>
          <View className="bg-blue-500 p-3 rounded-xl mb-3" style={{ opacity: 0.6 }}>
            <View className="flex-row items-center justify-center">
              <MaterialIcons name="analytics" size={18} color="white" />
              <Text className="text-white font-semibold text-center ml-2">
                {dashboardData.scansRemaining} scans remaining this month
              </Text>
            </View>
          </View>
          <View className="flex-row items-center justify-center">
            <Ionicons name="rocket" size={18} color="#dbeafe" />
            <Text className="text-blue-100 text-center text-sm ml-2">
              Tap to upgrade to Pro for unlimited scans
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Storage Overview Card - Modern design with gradient header */}
      <View className="bg-white m-4 rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <View className="p-5 border-b border-gray-100 bg-purple-50">
          <View className="flex-row items-center">
            <View className="bg-purple-100 p-2.5 rounded-xl mr-3">
              <MaterialCommunityIcons name="database" size={24} color="#9333ea" />
            </View>
            <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
              Storage Overview
            </Text>
          </View>
        </View>

        <View className="p-5">
          <View className="flex-row justify-between items-center mb-4 pb-4 border-b border-gray-100">
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="image-multiple" size={20} color="#6b7280" />
              <Text style={[typography.body.default, { color: colors.text.secondary, marginLeft: 8 }]}>Total Media</Text>
            </View>
            <View className="bg-purple-100 px-3 py-1.5 rounded-full">
              <Text style={[typography.label.large, { color: '#9333ea', fontWeight: 'bold' }]}>
                {dashboardData.totalMedia.toLocaleString()}
              </Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center mb-3 ml-7">
            <View className="flex-row items-center">
              <Ionicons name="image" size={16} color="#9ca3af" />
              <Text style={[typography.body.small, { color: colors.text.tertiary, marginLeft: 8 }]}>Photos</Text>
            </View>
            <Text style={[typography.body.small, { color: colors.text.secondary, fontWeight: '600' }]}>
              {dashboardData.totalPhotos.toLocaleString()}
            </Text>
          </View>

          <View className="flex-row justify-between items-center mb-4 ml-7">
            <View className="flex-row items-center">
              <Ionicons name="videocam" size={16} color="#9ca3af" />
              <Text style={[typography.body.small, { color: colors.text.tertiary, marginLeft: 8 }]}>Videos</Text>
            </View>
            <Text style={[typography.body.small, { color: colors.text.secondary, fontWeight: '600' }]}>
              {dashboardData.totalVideos.toLocaleString()}
            </Text>
          </View>

          <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-gray-100">
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="harddisk" size={20} color="#6b7280" />
              <Text style={[typography.body.default, { color: colors.text.secondary, marginLeft: 8 }]}>Total Size</Text>
            </View>
            <Text style={[typography.label.large, { color: colors.text.primary, fontWeight: 'bold' }]}>{dashboardData.totalSize}</Text>
          </View>

          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center">
              <Ionicons name="cloud-outline" size={20} color="#16a34a" />
              <Text style={[typography.body.default, { color: colors.text.secondary, marginLeft: 8 }]}>Free Space</Text>
            </View>
            <Text style={[typography.label.large, { color: colors.success.default, fontWeight: 'bold' }]}>{dashboardData.freeSpace}</Text>
          </View>
        </View>
      </View>

      {/* Potential Savings Card */}
      <View
        className="m-4 p-6 rounded-2xl shadow-lg border border-green-400"
        style={{
          backgroundColor: colors.success.default,
          shadowColor: '#16a34a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <View className="flex-row items-center mb-3">
          <View className="bg-white p-2.5 rounded-xl mr-3" style={{ opacity: 0.3 }}>
            <MaterialCommunityIcons name="chart-line" size={24} color="white" />
          </View>
          <Text style={[typography.heading.h4, { color: colors.text.inverse }]}>
            Potential Savings
          </Text>
        </View>

        <View className="bg-white p-4 rounded-xl mb-3" style={{ opacity: 0.3 }}>
          <Text style={[typography.special.displayNumber, { color: colors.text.inverse, textAlign: 'center' }]}>
            {dashboardData.potentialSavings}
          </Text>
        </View>

        <View className="flex-row items-center justify-center">
          <MaterialCommunityIcons name="image-multiple" size={16} color="white" />
          <Text style={[typography.body.small, { color: 'rgba(255,255,255,0.9)', marginLeft: 6 }]}>
            Based on {dashboardData.duplicateGroups} duplicate group{dashboardData.duplicateGroups !== 1 ? 's' : ''} found
          </Text>
        </View>
      </View>

      {/* Quick Action Cards */}
      <View className="mx-4 mb-4">
        <View className="flex-row items-center mb-4">
          <View className="bg-blue-100 p-2 rounded-xl mr-3">
            <Ionicons name="flash" size={20} color="#2563eb" />
          </View>
          <Text style={[typography.heading.h4, { color: colors.text.primary }]}>
            Quick Actions
          </Text>
        </View>

        {/* Duplicates Card - Using themed styles */}
        <QuickActionCard
          title="Duplicate Photos"
          subtitle={`${dashboardData.duplicateGroups} groups found`}
          badge={<SavingsBadge amount={dashboardData.potentialSavings} />}
          icon={<MaterialCommunityIcons name="image-multiple" size={24} color="#ef4444" />}
          iconBg="bg-red-100"
          onPress={() => handleQuickAction('Duplicates')}
        />

        {/* Large Files Card */}
        <QuickActionCard
          title="Large Files"
          subtitle={`${dashboardData.largeFilesCount} files over 5MB`}
          badge={<Badge label="Review" variant="largeFiles" />}
          icon={<MaterialCommunityIcons name="file-chart" size={24} color="#f59e0b" />}
          iconBg="bg-amber-100"
          onPress={() => handleQuickAction('LargeFiles')}
        />

        {/* Screenshots Card */}
        <QuickActionCard
          title="Screenshots"
          subtitle={`${dashboardData.screenshotsCount} screenshots found`}
          badge={<Badge label="Clean" variant="screenshots" />}
          icon={<MaterialIcons name="screenshot" size={24} color="#8b5cf6" />}
          iconBg="bg-purple-100"
          onPress={() => handleQuickAction('Screenshots')}
        />

        {/* Videos Card */}
        <QuickActionCard
          title="Videos"
          subtitle={`${dashboardData.totalVideos.toLocaleString()} videos found`}
          badge={<Badge label="Browse" variant="primary" />}
          icon={<Ionicons name="videocam" size={24} color="#06b6d4" />}
          iconBg="bg-cyan-100"
          onPress={() => handleQuickAction('VideoLibrary')}
        />

        {/* Photo Library Card */}
        <QuickActionCard
          title="All Media"
          subtitle={`Browse all ${dashboardData.totalMedia.toLocaleString()} items`}
          badge={<Badge label="View" variant="primary" />}
          icon={<Ionicons name="images" size={24} color="#2563eb" />}
          iconBg="bg-blue-100"
          onPress={() => handleQuickAction('PhotoLibrary')}
        />
      </View>

      {/* Start Scan Button - Modern design */}
      <View className="m-4">
        {isScanning ? (
          <View
            className="rounded-2xl p-6 border border-blue-400"
            style={{
              backgroundColor: colors.primary.default,
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <LoadingSpinner color={colors.text.inverse} label="Scanning your library..." />
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStartScan}
            className="rounded-2xl p-6 bg-blue-600 border border-blue-500"
            style={{
              backgroundColor: colors.primary.default,
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 10,
            }}
            activeOpacity={0.8}
          >
            <View className="flex-row items-center justify-center mb-2">
              <View className="bg-white p-2 rounded-lg mr-3" style={{ opacity: 0.3 }}>
                <MaterialCommunityIcons name="radar" size={24} color="white" />
              </View>
              <Text style={[typography.button.large, { color: colors.text.inverse, fontSize: 18, fontWeight: 'bold' }]}>
                Start New Scan
              </Text>
            </View>
            <View className="flex-row items-center justify-center">
              <MaterialIcons name="access-time" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={[typography.body.small, { color: 'rgba(255,255,255,0.8)', marginLeft: 6 }]}>
                Last scan: {dashboardData.lastScan}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Settings Link */}
      <View className="m-4 mb-8">
        <TouchableOpacity
          onPress={() => handleQuickAction('Settings')}
          className="bg-white p-4 rounded-2xl border border-gray-200"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center justify-center">
            <MaterialIcons name="settings" size={20} color="#6b7280" />
            <Text style={[typography.button.default, { color: colors.text.secondary, marginLeft: 8, fontWeight: '600' }]}>
              Settings & Preferences
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

/**
 * Helper Functions
 */

/**
 * Format bytes to human-readable string (e.g., "2.3 GB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 */
function formatTimeAgo(timestamp: string | number): string {
  const now = Date.now();
  const then = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

/**
 * QuickActionCard - Reusable card for quick actions
 */
interface QuickActionCardProps {
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  onPress: () => void;
}

function QuickActionCard({ title, subtitle, badge, icon, iconBg, onPress }: QuickActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white p-5 rounded-2xl mb-3 border border-gray-100"
      style={({ pressed }) => [
        {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        },
        pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View className="flex-row items-center">
        <View className={`p-3 rounded-xl mr-4 ${iconBg}`}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.label.large, { color: colors.text.primary, fontSize: 16, fontWeight: '600' }]}>
            {title}
          </Text>
          <Text style={[typography.body.small, { color: colors.text.tertiary, marginTop: spacing[1] }]}>
            {subtitle}
          </Text>
        </View>
        <View className="ml-2">
          {badge}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" style={{ marginLeft: 8 }} />
      </View>
    </Pressable>
  );
}
