import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import type { Photo } from '../database/queries/photos';
import { UsageManager } from '../services/UsageManager';
import { photoDeletionService } from '../services/PhotoDeletionService';

type ScreenshotsProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Screenshots'>;
};

// Extended photo type with selection state
type ScreenshotWithSelection = Photo & {
  selected: boolean;
};

type ScreenshotGroup = {
  period: string;
  screenshots: ScreenshotWithSelection[];
  totalSize: number; // in bytes
  expanded: boolean;
};

// Helper to format file size
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Group screenshots by time periods
 */
const groupScreenshotsByPeriod = (screenshots: ScreenshotWithSelection[]): ScreenshotGroup[] => {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const groups: ScreenshotGroup[] = [
    { period: 'Today', screenshots: [], totalSize: 0, expanded: true },
    { period: 'Yesterday', screenshots: [], totalSize: 0, expanded: false },
    { period: 'Last Week', screenshots: [], totalSize: 0, expanded: false },
    { period: 'Last Month', screenshots: [], totalSize: 0, expanded: false },
    { period: 'Older', screenshots: [], totalSize: 0, expanded: false },
  ];

  screenshots.forEach(screenshot => {
    const creationTime = (screenshot.creation_time || 0) * 1000; // Convert to milliseconds

    if (creationTime >= oneDayAgo) {
      groups[0].screenshots.push(screenshot);
      groups[0].totalSize += screenshot.file_size;
    } else if (creationTime >= twoDaysAgo) {
      groups[1].screenshots.push(screenshot);
      groups[1].totalSize += screenshot.file_size;
    } else if (creationTime >= oneWeekAgo) {
      groups[2].screenshots.push(screenshot);
      groups[2].totalSize += screenshot.file_size;
    } else if (creationTime >= oneMonthAgo) {
      groups[3].screenshots.push(screenshot);
      groups[3].totalSize += screenshot.file_size;
    } else {
      groups[4].screenshots.push(screenshot);
      groups[4].totalSize += screenshot.file_size;
    }
  });

  // Filter out empty groups
  return groups.filter(g => g.screenshots.length > 0);
};

export default function Screenshots({ navigation }: ScreenshotsProps) {
  // State management
  const [groups, setGroups] = useState<ScreenshotGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load screenshots from database
   */
  const loadScreenshots = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch screenshots from database
      const screenshots: Photo[] = await PhotoQueries.getScreenshots();

      // Add selection state
      const screenshotsWithSelection: ScreenshotWithSelection[] = screenshots.map(s => ({
        ...s,
        selected: false,
      }));

      // Group by time periods
      const groupedScreenshots = groupScreenshotsByPeriod(screenshotsWithSelection);

      setGroups(groupedScreenshots);
    } catch (err) {
      console.error('Error loading screenshots:', err);
      setError(err instanceof Error ? err.message : 'Failed to load screenshots');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete selected screenshots with usage limit check
   */
  const handleDeleteSelected = async () => {
    try {
      // Get all selected screenshots across all groups
      const selectedScreenshots = groups.flatMap(g => g.screenshots.filter(s => s.selected));

      if (selectedScreenshots.length === 0) {
        return;
      }

      // Check usage limits
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canCleanupDuplicates(selectedScreenshots.length);

      if (!allowed) {
        Alert.alert(
          'Cleanup Limit Reached',
          `You can only delete ${remaining} more screenshots this month on the free plan. Upgrade to Pro for unlimited deletions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      // Calculate total size to save
      const totalSize = selectedScreenshots.reduce((sum, s) => sum + s.file_size, 0);

      // Confirm deletion
      Alert.alert(
        'Delete Screenshots',
        `Are you sure you want to delete ${selectedScreenshots.length} screenshot${selectedScreenshots.length > 1 ? 's' : ''}? This will free up ${formatBytes(totalSize)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete from device and database
                const screenshotIds = selectedScreenshots.map(s => s.id);
                const result = await photoDeletionService.deletePhotos(screenshotIds);

                if (!result.success && result.deletedCount === 0) {
                  Alert.alert('Error', 'Failed to delete screenshots. Please try again.');
                  return;
                }

                // Record cleanup in usage limits for successfully deleted photos
                await usageManager.recordCleanup(result.deletedCount);

                // Reload screenshots
                await loadScreenshots();

                // Show appropriate message based on deletion results
                const message = result.success && result.deletedCount === selectedScreenshots.length
                  ? `${result.deletedCount} screenshot${result.deletedCount > 1 ? 's' : ''} deleted, ${formatBytes(totalSize)} freed!`
                  : `${result.deletedCount} of ${selectedScreenshots.length} screenshots deleted. Some deletions failed.`;

                Alert.alert(result.success ? 'Success' : 'Partial Success', message);
              } catch (err) {
                console.error('Error deleting screenshots:', err);
                Alert.alert('Error', 'Failed to delete screenshots. Please try again.');
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error in delete handler:', err);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  /**
   * Delete entire group
   */
  const handleDeleteGroup = async (group: ScreenshotGroup) => {
    try {
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canCleanupDuplicates(group.screenshots.length);

      if (!allowed) {
        Alert.alert(
          'Cleanup Limit Reached',
          `You can only delete ${remaining} more screenshots this month. Upgrade to Pro for unlimited deletions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      Alert.alert(
        'Delete Group',
        `Delete all ${group.screenshots.length} screenshots from "${group.period}"? This will free up ${formatBytes(group.totalSize)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete from device and database
                const screenshotIds = group.screenshots.map(s => s.id);
                const result = await photoDeletionService.deletePhotos(screenshotIds);

                if (!result.success && result.deletedCount === 0) {
                  Alert.alert('Error', 'Failed to delete screenshots. Please try again.');
                  return;
                }

                await usageManager.recordCleanup(result.deletedCount);
                await loadScreenshots();

                // Show appropriate message
                const message = result.success && result.deletedCount === group.screenshots.length
                  ? `${result.deletedCount} screenshots deleted!`
                  : `${result.deletedCount} of ${group.screenshots.length} screenshots deleted. Some deletions failed.`;

                Alert.alert(result.success ? 'Success' : 'Partial Success', message);
              } catch (err) {
                console.error('Error deleting group:', err);
                Alert.alert('Error', 'Failed to delete group. Please try again.');
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error in delete group handler:', err);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  // Load screenshots on mount
  useEffect(() => {
    loadScreenshots();
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadScreenshots();
    }, [])
  );

  // Set header with Swipe Mode button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('SwipeMode', { category: 'screenshots' })}
          style={{ marginRight: 16 }}
        >
          <Ionicons name="swap-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const toggleGroup = (period: string) => {
    setGroups(groups.map(g =>
      g.period === period ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const toggleScreenshotSelection = (groupPeriod: string, screenshotId: string) => {
    setGroups(groups.map(g =>
      g.period === groupPeriod
        ? {
            ...g,
            screenshots: g.screenshots.map(s =>
              s.id === screenshotId ? { ...s, selected: !s.selected } : s
            ),
          }
        : g
    ));
  };

  const selectAllInGroup = (period: string) => {
    setGroups(groups.map(g =>
      g.period === period
        ? { ...g, screenshots: g.screenshots.map(s => ({ ...s, selected: true })) }
        : g
    ));
  };

  const totalSelectedCount = groups.reduce(
    (sum, g) => sum + g.screenshots.filter(s => s.selected).length,
    0
  );

  const totalSelectedSize = groups.reduce((sum, g) => {
    const groupSelectedSize = g.screenshots
      .filter(s => s.selected)
      .reduce((gSum, s) => gSum + s.file_size, 0);
    return sum + groupSelectedSize;
  }, 0);

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading screenshots..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Screenshots"
          message={error}
          onRetry={loadScreenshots}
        />
      </View>
    );
  }

  // Show empty state
  if (groups.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          icon="📸"
          title="No Screenshots Found"
          message="Great! You don't have any screenshots cluttering your photo library."
          action={{
            label: "Go to Dashboard",
            onPress: () => navigation.navigate('Dashboard')
          }}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Summary Header */}
      <View className="bg-purple-600 p-4">
        <Text className="text-white text-2xl font-bold mb-1">
          {groups.reduce((sum, g) => sum + g.screenshots.length, 0)} Screenshots
        </Text>
        <Text className="text-purple-100">
          Taking up {formatBytes(groups.reduce((sum, g) => sum + g.totalSize, 0))}
        </Text>
      </View>

      <ScrollView className="flex-1">
        {groups.map((group) => (
          <View key={group.period} className="bg-white m-3 rounded-xl shadow-sm overflow-hidden">
            {/* Group Header */}
            <View className="bg-gray-50 p-4">
              <TouchableOpacity
                onPress={() => toggleGroup(group.period)}
                className="flex-row justify-between items-center mb-3"
              >
                <View>
                  <Text className="font-bold text-gray-800 text-lg mb-1">
                    {group.period}
                  </Text>
                  <Text className="text-sm text-gray-600">
                    {group.screenshots.length} screenshots • {formatBytes(group.totalSize)}
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl">
                  {group.expanded ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>

              {/* Quick Actions */}
              <View className="flex-row space-x-2">
                <TouchableOpacity
                  onPress={() => selectAllInGroup(group.period)}
                  className="flex-1 bg-blue-100 py-2 rounded-lg"
                >
                  <Text className="text-blue-700 text-center font-semibold text-sm">
                    Select All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteGroup(group)}
                  className="flex-1 bg-red-100 py-2 rounded-lg"
                >
                  <Text className="text-red-700 text-center font-semibold text-sm">
                    Delete Group
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Expanded Screenshot Grid */}
            {group.expanded && (
              <View className="p-3">
                <View className="flex-row flex-wrap">
                  {group.screenshots.map((screenshot) => (
                    <TouchableOpacity
                      key={screenshot.id}
                      onPress={() => toggleScreenshotSelection(group.period, screenshot.id)}
                      className="w-1/3 p-1"
                    >
                      <View className="relative">
                        <Image
                          source={{ uri: screenshot.uri }}
                          className="w-full aspect-[9/16] rounded-lg"
                          resizeMode="cover"
                        />
                        {screenshot.selected && (
                          <View className="absolute inset-0 bg-blue-600/40 rounded-lg items-center justify-center">
                            <View className="bg-blue-600 rounded-full w-10 h-10 items-center justify-center">
                              <Text className="text-white font-bold text-xl">✓</Text>
                            </View>
                          </View>
                        )}
                        <View className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs">{formatBytes(screenshot.file_size)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Delete Selected Action Bar */}
      {totalSelectedCount > 0 && (
        <View className="bg-white border-t border-gray-200 p-4">
          <View className="mb-2">
            <Text className="text-gray-600 text-sm">
              {totalSelectedCount} screenshot{totalSelectedCount > 1 ? 's' : ''} selected
            </Text>
            <Text className="font-bold text-gray-800 text-lg">
              {formatBytes(totalSelectedSize)} to recover
            </Text>
          </View>
          <TouchableOpacity
            className="bg-red-600 py-4 rounded-xl"
            onPress={handleDeleteSelected}
          >
            <Text className="text-white text-center font-bold text-lg">
              Delete Selected ({totalSelectedCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
