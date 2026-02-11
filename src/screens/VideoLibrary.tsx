import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';
import { colors, spacing, typography } from '../theme';

// Database queries
import * as VideoQueries from '../database/queries/videos';
import type { Video } from '../database/queries/videos';
import { UsageManager } from '../services/UsageManager';
import { mediaDeletionService } from '../services/MediaDeletionService';

// Utils
import { formatBytes, formatDuration } from '../utils/format';

type VideoLibraryProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'VideoLibrary'>;
};

// Extended video type with selection state
type VideoWithSelection = Video & {
  selected: boolean;
};

export default function VideoLibrary({ navigation }: VideoLibraryProps) {
  // State management
  const [videos, setVideos] = useState<VideoWithSelection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'duration'>('date');

  const selectedCount = videos.filter(v => v.selected).length;

  /**
   * Load videos from database with sorting
   */
  const loadVideos = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch videos from database
      const videoList: Video[] = await VideoQueries.getAllVideos({
        limit: 1000, // Load first 1000 videos for performance
        offset: 0,
      });

      // Sort in-memory based on selected option
      switch (sortBy) {
        case 'date':
          videoList.sort((a, b) => (b.creation_time || 0) - (a.creation_time || 0));
          break;
        case 'size':
          videoList.sort((a, b) => b.file_size - a.file_size);
          break;
        case 'duration':
          videoList.sort((a, b) => (b.duration || 0) - (a.duration || 0));
          break;
      }

      // Add selection state to each video
      const videosWithSelection: VideoWithSelection[] = videoList.map(video => ({
        ...video,
        selected: false,
      }));

      setVideos(videosWithSelection);
    } catch (err) {
      console.error('Error loading videos:', err);
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete selected videos with usage limit check
   */
  const handleDelete = async () => {
    try {
      const selectedVideos = videos.filter(v => v.selected);

      if (selectedVideos.length === 0) {
        return;
      }

      // Check usage limits
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canCleanupDuplicates(selectedVideos.length);

      if (!allowed) {
        Alert.alert(
          'Cleanup Limit Reached',
          `You can only delete ${remaining} more items this month on the free plan. Upgrade to Pro for unlimited deletions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      // Confirm deletion
      Alert.alert(
        'Delete Videos',
        `Are you sure you want to delete ${selectedVideos.length} video${selectedVideos.length > 1 ? 's' : ''}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete videos from both device and database
                const videoIds = selectedVideos.map(v => v.id);
                const result = await mediaDeletionService.deleteVideos(videoIds);

                if (!result.success) {
                  console.error('Some deletions failed:', result.errors);
                  // Show partial success message if some deletions failed
                  if (result.deletedCount > 0) {
                    Alert.alert(
                      'Partial Success',
                      `${result.deletedCount} of ${selectedVideos.length} videos deleted. Some deletions failed.`
                    );
                  } else {
                    Alert.alert('Error', 'Failed to delete videos');
                    return;
                  }
                }

                // Record cleanup in usage (only for successfully deleted videos)
                await usageManager.recordCleanup(result.deletedCount);

                // Reload videos
                await loadVideos();

                // Exit selection mode
                setSelectionMode(false);

                // Only show success alert if deletion was fully successful
                if (result.success && result.deletedCount === selectedVideos.length) {
                  Alert.alert('Success', `Deleted ${result.deletedCount} video${result.deletedCount > 1 ? 's' : ''}`);
                }
              } catch (err) {
                console.error('Error deleting videos:', err);
                Alert.alert('Error', 'Failed to delete videos');
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error in handleDelete:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete videos');
    }
  };

  /**
   * Toggle selection for a single video
   */
  const toggleVideoSelection = (videoId: string) => {
    if (!selectionMode) return;

    setVideos(prevVideos =>
      prevVideos.map(v =>
        v.id === videoId ? { ...v, selected: !v.selected } : v
      )
    );
  };

  /**
   * Toggle selection mode
   */
  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Deselect all when exiting selection mode
      setVideos(prevVideos => prevVideos.map(v => ({ ...v, selected: false })));
    }
    setSelectionMode(!selectionMode);
  };

  /**
   * Select all videos
   */
  const selectAll = () => {
    setVideos(prevVideos => prevVideos.map(v => ({ ...v, selected: true })));
  };

  /**
   * Deselect all videos
   */
  const deselectAll = () => {
    setVideos(prevVideos => prevVideos.map(v => ({ ...v, selected: false })));
  };

  // Load videos on mount and when sort option changes
  useEffect(() => {
    loadVideos();
  }, [sortBy]);

  // Reload videos when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadVideos();
    }, [sortBy])
  );

  // Set up header with Swipe Mode button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('SwipeMode', { category: 'videos', mediaType: 'video' })}
          style={{ marginRight: 16 }}
        >
          <Ionicons name="swap-horizontal" size={24} color="white" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading videos..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Videos"
          message={error}
          onRetry={loadVideos}
        />
      </View>
    );
  }

  // Show empty state
  if (videos.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          icon="🎬"
          title="No Videos Found"
          message="Start a scan to discover videos in your library"
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
      {/* Header Controls */}
      <View className="bg-white p-4 border-b border-gray-200">
        <View className="flex-row justify-between items-center mb-3">
          <Text style={[typography.label.large, { color: colors.text.primary }]}>
            {videos.length} video{videos.length !== 1 ? 's' : ''}
          </Text>

          {/* Sort Options */}
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setSortBy('date')}
              className={`px-3 py-1 rounded-full ${sortBy === 'date' ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <Text className={sortBy === 'date' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSortBy('size')}
              className={`px-3 py-1 rounded-full ${sortBy === 'size' ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <Text className={sortBy === 'size' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Size
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSortBy('duration')}
              className={`px-3 py-1 rounded-full ${sortBy === 'duration' ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <Text className={sortBy === 'duration' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Duration
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selection Controls */}
        <View className="flex-row justify-between items-center">
          {selectionMode ? (
            <>
              <View className="flex-row gap-2">
                <TouchableOpacity onPress={selectAll} className="px-3 py-1 bg-blue-100 rounded">
                  <Text className="text-blue-600 text-xs">Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deselectAll} className="px-3 py-1 bg-gray-200 rounded">
                  <Text className="text-gray-700 text-xs">Deselect All</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={toggleSelectionMode} className="px-3 py-1 bg-gray-200 rounded">
                <Text className="text-gray-700 text-xs">Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => navigation.navigate('SwipeMode', { category: 'videos', mediaType: 'video' })}
                className="flex-row items-center px-3 py-1 bg-purple-600 rounded"
              >
                <Ionicons name="swap-horizontal" size={14} color="white" style={{ marginRight: 4 }} />
                <Text className="text-white text-xs">Swipe Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleSelectionMode} className="px-3 py-1 bg-blue-600 rounded">
                <Text className="text-white text-xs">Select Videos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Video Grid */}
      <FlashList
        data={videos}
        keyExtractor={(item) => item.id}
        numColumns={3}
        renderItem={({ item }) => (
          <VideoThumbnail
            video={item}
            selected={item.selected}
            selectionMode={selectionMode}
            onPress={() => toggleVideoSelection(item.id)}
          />
        )}
        contentContainerStyle={{ padding: 2 }}
      />

      {/* Action Bar (shown when videos are selected) */}
      {selectionMode && selectedCount > 0 && (
        <View className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200">
          <View className="flex-row justify-between items-center">
            <Text style={[typography.label.default, { color: colors.text.primary }]}>
              {selectedCount} selected
            </Text>
            <TouchableOpacity
              onPress={handleDelete}
              className="bg-red-600 px-6 py-2 rounded-lg"
            >
              <Text className="text-white font-semibold">Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * VideoThumbnail Component
 * Displays a single video thumbnail with play icon and duration
 */
interface VideoThumbnailProps {
  video: VideoWithSelection;
  selected: boolean;
  selectionMode: boolean;
  onPress: () => void;
}

function VideoThumbnail({ video, selected, selectionMode, onPress }: VideoThumbnailProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!selectionMode}
      style={styles.thumbnail}
      activeOpacity={selectionMode ? 0.7 : 1}
    >
      {/* Video Thumbnail */}
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri: video.uri }}
          style={styles.thumbnailImage}
          resizeMode="cover"
        />

        {/* Play Icon Overlay */}
        <View style={styles.playIconOverlay}>
          <Ionicons name="play-circle" size={40} color="white" style={{ opacity: 0.9 }} />
        </View>

        {/* Duration Badge (top-left) */}
        {video.duration !== undefined && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(video.duration)}</Text>
          </View>
        )}

        {/* File Size Badge (bottom-right - iOS style) */}
        {/* TEMPORARY DEBUG: Show badge even if file_size is 0 */}
        <View style={styles.fileSizeBadge}>
          <Text style={styles.fileSizeText}>
            {video.file_size > 0 ? formatBytes(video.file_size) : `0 (${video.id.slice(0, 8)})`}
          </Text>
        </View>

        {/* Selection Checkbox */}
        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected && <Ionicons name="checkmark" size={16} color="white" />}
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    flex: 1,
    margin: 2,
  },
  thumbnailContainer: {
    aspectRatio: 1,
    backgroundColor: colors.neutral.background,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  playIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  durationBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  fileSizeBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 123, 255, 0.9)', // iOS blue
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileSizeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  checkboxContainer: {
    position: 'absolute',
    top: 4,
    left: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary.default,
    borderColor: colors.primary.default,
  },
});
