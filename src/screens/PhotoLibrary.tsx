import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import type { Photo } from '../database/queries/photos';
import { UsageManager } from '../services/UsageManager';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date');

  const selectedCount = photos.filter(p => p.selected).length;

  /**
   * Load photos from database with sorting
   * This fetches real photos instead of mock data
   */
  const loadPhotos = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch photos from database
      // TODO: Implement custom sorting in database queries
      const photoList: Photo[] = await PhotoQueries.getAllPhotos({
        limit: 1000, // Load first 1000 photos for performance
        offset: 0,
      });

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
      console.error('Error loading photos:', err);
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    } finally {
      setIsLoading(false);
    }
  };

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
                // Delete from database (soft delete)
                for (const photo of selectedPhotos) {
                  await PhotoQueries.deletePhoto(photo.id);
                }

                // Record cleanup in usage limits
                await usageManager.recordCleanup(selectedPhotos.length);

                // Reload photos
                await loadPhotos();

                // Exit selection mode
                setSelectionMode(false);

                Alert.alert('Success', `${selectedPhotos.length} photo${selectedPhotos.length > 1 ? 's' : ''} deleted.`);
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

  // Load photos on mount
  useEffect(() => {
    loadPhotos();
  }, []);

  // Reload when sort changes
  useEffect(() => {
    if (!isLoading) {
      loadPhotos();
    }
  }, [sortBy]);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [sortBy])
  );

  const toggleSelection = (id: string) => {
    setPhotos(photos.map(p =>
      p.id === id ? { ...p, selected: !p.selected } : p
    ));
  };

  const selectAll = () => {
    setPhotos(photos.map(p => ({ ...p, selected: true })));
  };

  const deselectAll = () => {
    setPhotos(photos.map(p => ({ ...p, selected: false })));
    setSelectionMode(false);
  };

  // Helper to format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const renderPhoto = ({ item }: { item: PhotoWithSelection }) => (
    <TouchableOpacity
      onPress={() => selectionMode && toggleSelection(item.id)}
      onLongPress={() => {
        setSelectionMode(true);
        toggleSelection(item.id);
      }}
      className="p-1"
      style={{ width: '33.33%' }}
    >
      <View className="relative">
        <Image
          source={{ uri: item.uri }}
          className="w-full aspect-square rounded-lg"
          resizeMode="cover"
        />
        {item.selected && (
          <View className="absolute top-2 right-2 bg-blue-600 rounded-full w-6 h-6 items-center justify-center">
            <Text className="text-white font-bold">✓</Text>
          </View>
        )}
        <View className="absolute bottom-1 right-1 bg-black/60 px-2 py-0.5 rounded">
          <Text className="text-white text-xs">{formatBytes(item.file_size)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <LoadingSpinner size="large" label="Loading your photos..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-white">
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
      <View className="flex-1 bg-white">
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
    <View className="flex-1 bg-white">
      {/* Filter and Sort Bar */}
      <View className="bg-gray-100 p-3 border-b border-gray-200">
        <View className="flex-row justify-between items-center">
          <Text className="text-sm text-gray-600">
            {photos.length} photos
          </Text>
          <View className="flex-row space-x-2">
            <TouchableOpacity
              className={`px-3 py-1 rounded-full ${sortBy === 'date' ? 'bg-blue-600' : 'bg-gray-300'}`}
              onPress={() => setSortBy('date')}
            >
              <Text className={sortBy === 'date' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-3 py-1 rounded-full ${sortBy === 'size' ? 'bg-blue-600' : 'bg-gray-300'}`}
              onPress={() => setSortBy('size')}
            >
              <Text className={sortBy === 'size' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Size
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-3 py-1 rounded-full ${sortBy === 'name' ? 'bg-blue-600' : 'bg-gray-300'}`}
              onPress={() => setSortBy('name')}
            >
              <Text className={sortBy === 'name' ? 'text-white text-xs' : 'text-gray-700 text-xs'}>
                Name
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Photo Grid using FlashList for performance */}
      <FlashList
        data={photos}
        renderItem={renderPhoto}
        numColumns={3}
        keyExtractor={(item) => item.id}
      />

      {/* Selection Action Bar */}
      {selectionMode && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex-row justify-between items-center">
          <View>
            <Text className="font-semibold text-gray-800">
              {selectedCount} selected
            </Text>
          </View>
          <View className="flex-row space-x-2">
            {selectedCount < photos.length && (
              <TouchableOpacity
                onPress={selectAll}
                className="bg-blue-100 px-4 py-2 rounded-lg"
              >
                <Text className="text-blue-600 font-semibold">Select All</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={deselectAll}
              className="bg-gray-200 px-4 py-2 rounded-lg"
            >
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            {selectedCount > 0 && (
              <TouchableOpacity
                onPress={handleDelete}
                className="bg-red-600 px-4 py-2 rounded-lg"
              >
                <Text className="text-white font-semibold">Delete ({selectedCount})</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Bulk Selection Toggle */}
      {!selectionMode && (
        <TouchableOpacity
          onPress={() => setSelectionMode(true)}
          className="absolute bottom-6 right-6 bg-blue-600 rounded-full px-6 py-3 shadow-lg"
        >
          <Text className="text-white font-semibold">Select</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
