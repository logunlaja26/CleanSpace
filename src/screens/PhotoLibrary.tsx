import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';
import { colors, typography } from '../theme';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import type { Photo } from '../database/queries/photos';
import { UsageManager } from '../services/UsageManager';
import { photoDeletionService } from '../services/PhotoDeletionService';

type PhotoLibraryProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PhotoLibrary'>;
};

// Extended photo type with selection state
type PhotoWithSelection = Photo & {
  selected: boolean;
};

export default function PhotoLibrary({ navigation }: PhotoLibraryProps) {
  // State management
  const [photos, setPhotos] = useState<PhotoWithSelection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date');
  const isFirstMount = React.useRef(true);

  const selectedCount = photos.filter(p => p.selected).length;

  /**
   * Load photos from database with sorting
   * This fetches real photos instead of mock data
   */
  const loadPhotos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch photos from database
      // TODO: Implement custom sorting in database queries
      const photoList: Photo[] = await PhotoQueries.getAllPhotos({
        limit: 1000, // Load first 1000 photos for performance
        offset: 0,
      });

      console.log(`[PhotoLibrary] Loaded ${photoList.length} photos from database`);

      // Sort in-memory for now (will move to database later for performance)
      switch (sortBy) {
        case 'date':
          photoList.sort((a, b) => (b.creation_time || 0) - (a.creation_time || 0));
          break;
        case 'size':
          photoList.sort((a, b) => b.file_size - a.file_size);
          break;
        case 'name':
          photoList.sort((a, b) => a.filename.localeCompare(b.filename));
          break;
      }

      // Add selection state to each photo
      const photosWithSelection: PhotoWithSelection[] = photoList.map(photo => ({
        ...photo,
        selected: false,
      }));

      setPhotos(photosWithSelection);
    } catch (err) {
      console.error('[PhotoLibrary] Error loading photos:', err);
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    } finally {
      setIsLoading(false);
    }
  }, [sortBy]);

  /**
   * Delete selected photos with usage limit check
   */
  const handleDelete = async () => {
    try {
      const selectedPhotos = photos.filter(p => p.selected);

      if (selectedPhotos.length === 0) {
        return;
      }

      // Check usage limits
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canCleanupDuplicates(selectedPhotos.length);

      if (!allowed) {
        Alert.alert(
          'Cleanup Limit Reached',
          `You can only delete ${remaining} more photos this month on the free plan. Upgrade to Pro for unlimited deletions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      // Confirm deletion
      Alert.alert(
        'Delete Photos',
        `Are you sure you want to delete ${selectedPhotos.length} photo${selectedPhotos.length > 1 ? 's' : ''}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete from device and database
                const photoIds = selectedPhotos.map(p => p.id);
                const result = await photoDeletionService.deletePhotos(photoIds);

                if (!result.success) {
                  console.error('Some deletions failed:', result.errors);
                  // Show partial success if some deletions worked
                  if (result.deletedCount > 0) {
                    Alert.alert(
                      'Partial Success',
                      `${result.deletedCount} of ${selectedPhotos.length} photos deleted. Some deletions failed.`
                    );
                  } else {
                    Alert.alert('Error', 'Failed to delete photos. Please try again.');
                    return;
                  }
                }

                // Record cleanup in usage limits for successfully deleted photos
                await usageManager.recordCleanup(result.deletedCount);

                // Reload photos
                await loadPhotos();

                // Exit selection mode
                setSelectionMode(false);

                // Show success message only if all deletions succeeded
                if (result.success && result.deletedCount === selectedPhotos.length) {
                  Alert.alert('Success', `${result.deletedCount} photo${result.deletedCount > 1 ? 's' : ''} deleted.`);
                }
              } catch (err) {
                console.error('Error deleting photos:', err);
                Alert.alert('Error', 'Failed to delete photos. Please try again.');
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

  // Load photos on mount and when sort changes
  useEffect(() => {
    loadPhotos();
  }, [sortBy, loadPhotos]);

  // Reload when screen comes into focus (skip on initial mount)
  useFocusEffect(
    useCallback(() => {
      if (isFirstMount.current) {
        isFirstMount.current = false;
        return;
      }
      loadPhotos();
    }, [loadPhotos])
  );

  // Set header with Swipe Mode button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('SwipeMode', { category: 'all', mediaType: 'photo' })}
          style={{ marginRight: 16 }}
        >
          <Ionicons name="swap-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const togglePhotoSelection = (photoId: string) => {
    if (!selectionMode) return;

    setPhotos(prevPhotos =>
      prevPhotos.map(p =>
        p.id === photoId ? { ...p, selected: !p.selected } : p
      )
    );
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Deselect all when exiting selection mode
      setPhotos(prevPhotos => prevPhotos.map(p => ({ ...p, selected: false })));
    }
    setSelectionMode(!selectionMode);
  };

  const selectAll = () => {
    setPhotos(prevPhotos => prevPhotos.map(p => ({ ...p, selected: true })));
  };

  const deselectAll = () => {
    setPhotos(prevPhotos => prevPhotos.map(p => ({ ...p, selected: false })));
  };

  // Show loading state (only on initial load)
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading photos..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Photos"
          message={error}
          onRetry={loadPhotos}
        />
      </View>
    );
  }

  // Show empty state
  if (photos.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          icon="📷"
          title="No Photos Found"
          message="Start a scan from the Dashboard to analyze your photo library."
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
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
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
              onPress={() => setSortBy('name')}
              className={`px-3 py-1 rounded-full ${sortBy === 'name' ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <Text className={sortBy === 'name' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Name
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
                onPress={() => navigation.navigate('SwipeMode', { category: 'all', mediaType: 'photo' })}
                className="flex-row items-center px-3 py-1 bg-purple-600 rounded"
              >
                <Ionicons name="swap-horizontal" size={14} color="white" style={{ marginRight: 4 }} />
                <Text className="text-white text-xs">Swipe Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleSelectionMode} className="px-3 py-1 bg-blue-600 rounded">
                <Text className="text-white text-xs">Select Photos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <FlashList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={3}
          extraData={selectionMode}
          renderItem={({ item }) => (
            <PhotoThumbnail
              photo={item}
              selected={item.selected}
              selectionMode={selectionMode}
              onPress={() => togglePhotoSelection(item.id)}
            />
          )}
          contentContainerStyle={{ padding: 2 }}
        />
      )}

      {/* Action Bar (shown when photos are selected) */}
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
 * PhotoThumbnail Component
 * Displays a single photo thumbnail with selection checkbox
 */
interface PhotoThumbnailProps {
  photo: PhotoWithSelection;
  selected: boolean;
  selectionMode: boolean;
  onPress: () => void;
}

function PhotoThumbnail({ photo, selected, selectionMode, onPress }: PhotoThumbnailProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!selectionMode}
      style={styles.thumbnail}
      activeOpacity={selectionMode ? 0.7 : 1}
    >
      {/* Photo Thumbnail */}
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri: photo.uri }}
          style={styles.thumbnailImage}
          resizeMode="cover"
        />

        {/* Selection Checkbox */}
        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected && <Ionicons name="checkmark" size={16} color="white" />}
            </View>
          </View>
        )}
      </View>

      {/* File Size */}
      {photo.file_size > 0 && (
        <Text style={styles.fileSize}>
          {formatBytes(photo.file_size)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * Helper function to format bytes
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
  fileSize: {
    fontSize: 10,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: 2,
  },
});
