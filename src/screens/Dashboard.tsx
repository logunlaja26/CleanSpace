import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Button, Badge, SavingsBadge, LoadingSpinner, ErrorState } from '../components';
import { colors, spacing, typography, layout } from '../theme';

// Services
import { StorageAnalytics } from '../services/StorageAnalytics';
import { UsageManager } from '../services/UsageManager';
import { PhotoScanner, ScanType } from '../services/PhotoScanner';
import * as PhotoQueries from '../database/queries/photos';
import * as DuplicateQueries from '../database/queries/duplicates';
import * as ScanHistoryQueries from '../database/queries/scanHistory';

type DashboardProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

// Dashboard data type
interface DashboardData {
  totalPhotos: number;
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
      setDashboardData({
        totalPhotos: storageData.photoCount,
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

      // Start the scan
      const result = await scanner.startScan(ScanType.FULL);

      // Record the scan
      await usageManager.recordScan();

      // Reload dashboard data to reflect new scan results
      await loadDashboardData();

      // Show success message
      Alert.alert(
        'Scan Complete!',
        `Scanned ${result.photosScanned} photos in ${Math.round(result.duration / 1000)}s.`,
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
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading your dashboard..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Dashboard"
          message={error}
          onRetry={loadDashboardData}
        />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Free Tier Usage Banner */}
      {dashboardData.tier === 'free' && (
        <TouchableOpacity
          onPress={() => handleQuickAction('Paywall')}
          className="bg-blue-600 p-4 m-4 rounded-xl"
          activeOpacity={0.8}
        >
          <Text className="text-white font-bold text-center mb-1">
            Free Plan: {dashboardData.scansRemaining} scans remaining this month
          </Text>
          <Text className="text-blue-100 text-center text-sm">
            Tap to upgrade to Pro for unlimited scans
          </Text>
        </TouchableOpacity>
      )}

      {/* Storage Overview Card - Using new Card component style */}
      <View className="bg-white m-4 p-6 rounded-xl" style={layout.shadow.default}>
        <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing[4] }]}>
          Storage Overview
        </Text>
        <View className="flex-row justify-between mb-3">
          <Text style={[typography.body.default, { color: colors.text.secondary }]}>Total Photos</Text>
          <Text style={[typography.label.large, { color: colors.text.primary }]}>
            {dashboardData.totalPhotos.toLocaleString()}
          </Text>
        </View>
        <View className="flex-row justify-between mb-3">
          <Text style={[typography.body.default, { color: colors.text.secondary }]}>Total Size</Text>
          <Text style={[typography.label.large, { color: colors.text.primary }]}>{dashboardData.totalSize}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text style={[typography.body.default, { color: colors.text.secondary }]}>Free Space</Text>
          <Text style={[typography.label.large, { color: colors.success.default }]}>{dashboardData.freeSpace}</Text>
        </View>
      </View>

      {/* Potential Savings Card */}
      <View
        className="m-4 p-6 rounded-xl"
        style={{ backgroundColor: colors.success.default }}
      >
        <Text style={[typography.heading.h4, { color: colors.text.inverse, marginBottom: spacing[2] }]}>
          Potential Savings
        </Text>
        <Text style={[typography.special.displayNumber, { color: colors.text.inverse, marginBottom: spacing[1] }]}>
          {dashboardData.potentialSavings}
        </Text>
        <Text style={[typography.body.small, { color: colors.success.light }]}>
          Based on {dashboardData.duplicateGroups} duplicate groups found
        </Text>
      </View>

      {/* Quick Action Cards */}
      <View className="mx-4 mb-4">
        <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing[3] }]}>
          Quick Actions
        </Text>

        {/* Duplicates Card - Using themed styles */}
        <QuickActionCard
          title="Duplicate Photos"
          subtitle={`${dashboardData.duplicateGroups} groups found`}
          badge={<SavingsBadge amount={dashboardData.potentialSavings} />}
          onPress={() => handleQuickAction('Duplicates')}
        />

        {/* Large Files Card */}
        <QuickActionCard
          title="Large Files"
          subtitle={`${dashboardData.largeFilesCount} files over 5MB`}
          badge={<Badge label="Review" variant="largeFiles" />}
          onPress={() => handleQuickAction('LargeFiles')}
        />

        {/* Screenshots Card */}
        <QuickActionCard
          title="Screenshots"
          subtitle={`${dashboardData.screenshotsCount} screenshots found`}
          badge={<Badge label="Clean" variant="screenshots" />}
          onPress={() => handleQuickAction('Screenshots')}
        />

        {/* Photo Library Card */}
        <QuickActionCard
          title="All Photos"
          subtitle={`Browse all ${dashboardData.totalPhotos.toLocaleString()} photos`}
          badge={<Badge label="View" variant="primary" />}
          onPress={() => handleQuickAction('PhotoLibrary')}
        />
      </View>

      {/* Start Scan Button - Using new Button component */}
      <View className="m-4">
        {isScanning ? (
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: colors.primary.default }}
          >
            <LoadingSpinner color={colors.text.inverse} label="Scanning your library..." />
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStartScan}
            className="rounded-xl p-4"
            style={[{ backgroundColor: colors.primary.default }, layout.shadow.md]}
            activeOpacity={0.8}
          >
            <Text style={[typography.button.large, { color: colors.text.inverse, textAlign: 'center' }]}>
              Start New Scan
            </Text>
            <Text style={[typography.body.small, { color: colors.primary.lighter, textAlign: 'center', marginTop: spacing[1] }]}>
              Last scan: {dashboardData.lastScan}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Settings Link */}
      <View className="m-4 mb-8">
        <Button
          label="Settings & Preferences"
          variant="link"
          onPress={() => handleQuickAction('Settings')}
        />
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
  onPress: () => void;
}

function QuickActionCard({ title, subtitle, badge, onPress }: QuickActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white p-4 rounded-xl mb-3"
      style={({ pressed }) => [
        layout.shadow.default,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View className="flex-row justify-between items-center">
        <View style={{ flex: 1 }}>
          <Text style={[typography.label.large, { color: colors.text.primary }]}>
            {title}
          </Text>
          <Text style={[typography.body.small, { color: colors.text.tertiary, marginTop: spacing[1] }]}>
            {subtitle}
          </Text>
        </View>
        {badge}
      </View>
    </Pressable>
  );
}
