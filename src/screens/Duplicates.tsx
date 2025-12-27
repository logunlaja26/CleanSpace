import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';

// Database queries and services
import * as DuplicateQueries from '../database/queries/duplicates';
import type { DuplicateGroupWithPhotos } from '../database/queries/duplicates';
import * as PhotoQueries from '../database/queries/photos';
import { UsageManager } from '../services/UsageManager';

type DuplicatesProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Duplicates'>;
};

// Extended type for UI state
type DuplicateGroupUI = DuplicateGroupWithPhotos & {
  expanded: boolean;
  selectedPhotoIds: Set<string>; // Track which photos to KEEP
};

// Helper functions
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'exact':
      return 'Exact Match';
    case 'similar':
      return 'Visually Similar';
    case 'burst':
      return 'Burst Photos';
    case 'screenshot':
      return 'Screenshot Group';
    default:
      return 'Unknown';
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'exact':
      return 'bg-red-100 text-red-700';
    case 'similar':
      return 'bg-orange-100 text-orange-700';
    case 'burst':
      return 'bg-blue-100 text-blue-700';
    case 'screenshot':
      return 'bg-purple-100 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

export default function Duplicates({ navigation }: DuplicatesProps) {
  // State management
  const [groups, setGroups] = useState<DuplicateGroupUI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load duplicate groups from database
   */
  const loadDuplicateGroups = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch all duplicate groups
      const duplicateGroups = await DuplicateQueries.getDuplicateGroups();

      // Fetch photos for each group and transform to UI format
      const groupsWithPhotos = await Promise.all(
        duplicateGroups.map(async (group) => {
          // Get photos for this group
          const groupDetails = await DuplicateQueries.getDuplicateGroupWithPhotos(group.id);
          return groupDetails;
        })
      );

      // Filter out null values and transform to UI format
      const groupsUI: DuplicateGroupUI[] = groupsWithPhotos
        .filter((g): g is DuplicateGroupWithPhotos => g !== null && g.photos.length > 0)
        .map((group) => {
          // Find the primary (recommended) photo
          const primaryPhotoId = group.photos.find(p => p.is_primary)?.photo_id || group.photos[0]?.photo_id;

          return {
            ...group,
            expanded: false,
            selectedPhotoIds: new Set(primaryPhotoId ? [primaryPhotoId] : []), // Pre-select recommended photo
          };
        });

      setGroups(groupsUI);
    } catch (err) {
      console.error('Error loading duplicate groups:', err);
      setError(err instanceof Error ? err.message : 'Failed to load duplicates');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete duplicates in a group (keep only selected photos)
   */
  const handleDeleteGroup = async (group: DuplicateGroupUI) => {
    try {
      const photosToDelete = group.photos.filter(
        p => !group.selectedPhotoIds.has(p.photo_id)
      );

      if (photosToDelete.length === 0) {
        Alert.alert('No Photos Selected', 'Please select at least one photo to keep.');
        return;
      }

      // Check usage limits
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canCleanupDuplicates(photosToDelete.length);

      if (!allowed) {
        Alert.alert(
          'Cleanup Limit Reached',
          `You can only delete ${remaining} more photos this month. Upgrade to Pro for unlimited deletions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      // Confirm deletion
      Alert.alert(
        'Delete Duplicates',
        `Delete ${photosToDelete.length} duplicate${photosToDelete.length > 1 ? 's' : ''} and save ${formatBytes(
          photosToDelete.reduce((sum, p) => sum + (p.file_size || 0), 0)
        )}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete photos from database
                for (const photo of photosToDelete) {
                  await PhotoQueries.deletePhoto(photo.photo_id);
                }

                // Record cleanup
                await usageManager.recordCleanup(photosToDelete.length);

                // Reload groups
                await loadDuplicateGroups();

                Alert.alert('Success', `${photosToDelete.length} duplicate${photosToDelete.length > 1 ? 's' : ''} deleted!`);
              } catch (err) {
                console.error('Error deleting duplicates:', err);
                Alert.alert('Error', 'Failed to delete duplicates. Please try again.');
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
   * Toggle photo selection within a group
   */
  const togglePhotoSelection = (groupId: number, photoId: string) => {
    setGroups(groups.map(g => {
      if (g.id === groupId) {
        const newSelection = new Set(g.selectedPhotoIds);
        if (newSelection.has(photoId)) {
          newSelection.delete(photoId);
        } else {
          newSelection.add(photoId);
        }
        return { ...g, selectedPhotoIds: newSelection };
      }
      return g;
    }));
  };

  const toggleGroup = (groupId: number) => {
    setGroups(groups.map(g =>
      g.id === groupId ? { ...g, expanded: !g.expanded } : g
    ));
  };

  // Load on mount
  useEffect(() => {
    loadDuplicateGroups();
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDuplicateGroups();
    }, [])
  );

  // Calculate total savings from all groups
  const totalSavings = groups.reduce((sum, g) => {
    // Calculate savings as total size minus largest photo in group
    const largestPhoto = Math.max(...g.photos.map(p => p.file_size || 0));
    const groupTotal = g.photos.reduce((s, p) => s + (p.file_size || 0), 0);
    return sum + (groupTotal - largestPhoto);
  }, 0);

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Finding duplicates..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Duplicates"
          message={error}
          onRetry={loadDuplicateGroups}
        />
      </View>
    );
  }

  // Show empty state
  if (groups.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          icon="✨"
          title="No Duplicates Found"
          message="Great! Your photo library doesn't have any duplicate photos. Run a scan to check for new duplicates."
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
      <View className="bg-green-600 p-5">
        <Text className="text-white text-3xl font-bold mb-1">
          {formatBytes(totalSavings)}
        </Text>
        <Text className="text-green-100">
          Potential savings from {groups.length} duplicate groups
        </Text>
      </View>

      <ScrollView className="flex-1">
        {groups.map((group) => (
          <View key={group.id} className="bg-white m-3 rounded-xl shadow-sm overflow-hidden">
            {/* Group Header */}
            <TouchableOpacity
              onPress={() => toggleGroup(group.id)}
              className="p-4 flex-row justify-between items-center bg-gray-50"
            >
              <View className="flex-1">
                <View className="flex-row items-center mb-2">
                  <View className={`px-2 py-1 rounded ${getTypeColor(group.group_type)}`}>
                    <Text className="text-xs font-semibold">{getTypeLabel(group.group_type)}</Text>
                  </View>
                  <View className="ml-2 bg-gray-200 px-2 py-1 rounded">
                    <Text className="text-xs text-gray-700">
                      {(group.confidence_score * 100).toFixed(0)}% confident
                    </Text>
                  </View>
                </View>
                <Text className="font-semibold text-gray-800 mb-1">
                  {group.photo_count} duplicate photos
                </Text>
                <Text className="text-sm text-green-600 font-semibold">
                  Save {formatBytes(group.potential_savings || 0)}
                </Text>
              </View>
              <Text className="text-gray-400 text-xl">
                {group.expanded ? '▼' : '▶'}
              </Text>
            </TouchableOpacity>

            {/* Expanded Photo Grid */}
            {group.expanded && (
              <View className="p-4">
                <Text className="text-sm text-gray-600 mb-3">
                  Select photos to keep (others will be deleted):
                </Text>
                <View className="flex-row flex-wrap">
                  {group.photos.map((photo) => (
                    <View key={photo.photo_id} className="w-1/3 p-1">
                      <TouchableOpacity
                        onPress={() => togglePhotoSelection(group.id, photo.photo_id)}
                        className="relative"
                      >
                        <Image
                          source={{ uri: photo.uri || 'https://via.placeholder.com/150' }}
                          className="w-full aspect-square rounded-lg"
                          resizeMode="cover"
                        />
                        {photo.is_primary && (
                          <View className="absolute top-1 left-1 bg-green-600 rounded px-2 py-1">
                            <Text className="text-white text-xs font-bold">Best</Text>
                          </View>
                        )}
                        {group.selectedPhotoIds.has(photo.photo_id) && (
                          <View className="absolute top-2 right-2 bg-blue-600 rounded-full w-6 h-6 items-center justify-center">
                            <Text className="text-white font-bold">✓</Text>
                          </View>
                        )}
                        <View className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs">{formatBytes(photo.file_size || 0)}</Text>
                        </View>
                        {photo.quality_score && (
                          <View className="absolute bottom-1 left-1 bg-blue-600 rounded px-2 py-0.5">
                            <Text className="text-white text-xs">Q: {photo.quality_score}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  onPress={() => handleDeleteGroup(group)}
                  className="mt-4 bg-red-600 py-3 rounded-lg"
                >
                  <Text className="text-white text-center font-semibold">
                    Delete Unselected ({group.photos.length - group.selectedPhotoIds.size})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* Empty State */}
        {groups.length === 0 && (
          <View className="items-center justify-center p-10">
            <Text className="text-gray-400 text-lg mb-2">No duplicates found</Text>
            <Text className="text-gray-400 text-center">
              Run a scan to detect duplicate photos
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="bg-white border-t border-gray-200 p-4">
        <TouchableOpacity className="bg-red-600 py-4 rounded-xl">
          <Text className="text-white text-center font-bold text-lg">
            Clean All Duplicates ({totalSavings.toFixed(1)} MB)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}