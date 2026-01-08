import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import type { Photo } from '../database/queries/photos';
import { UsageManager } from '../services/UsageManager';

type LargeFilesProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LargeFiles'>;
};

// Extended photo type with selection state
type LargeFileWithSelection = Photo & {
  selected: boolean;
};

// Helper to format file size
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Size is in bytes - convert to MB for threshold checks
const getSizeColor = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  if (mb > 50) return 'text-red-600';
  if (mb > 20) return 'text-orange-600';
  if (mb > 10) return 'text-yellow-600';
  return 'text-gray-700';
};

const getSizeBadgeColor = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  if (mb > 50) return 'bg-red-100';
  if (mb > 20) return 'bg-orange-100';
  if (mb > 10) return 'bg-yellow-100';
  return 'bg-gray-100';
};

export default function LargeFiles({ navigation }: LargeFilesProps) {
  // State management
  const [files, setFiles] = useState<LargeFileWithSelection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'video'>('all');

  /**
   * Load large files from database (files > 5MB)
   */
  const loadLargeFiles = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch large files from database (5MB threshold)
      const largeFiles: Photo[] = await PhotoQueries.getLargeFiles(5 * 1024 * 1024);

      // Add selection state to each file
      const filesWithSelection: LargeFileWithSelection[] = largeFiles.map(file => ({
        ...file,
        selected: false,
      }));

      setFiles(filesWithSelection);
    } catch (err) {
      console.error('Error loading large files:', err);
      setError(err instanceof Error ? err.message : 'Failed to load large files');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete selected files with usage limit check
   */
  const handleDelete = async () => {
    try {
      const selectedFiles = files.filter(f => f.selected);

      if (selectedFiles.length === 0) {
        return;
      }

      // Check usage limits
      const usageManager = new UsageManager();
      const { allowed, remaining } = await usageManager.canCleanupDuplicates(selectedFiles.length);

      if (!allowed) {
        Alert.alert(
          'Cleanup Limit Reached',
          `You can only delete ${remaining} more files this month on the free plan. Upgrade to Pro for unlimited deletions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      // Calculate total size to save
      const totalSize = selectedFiles.reduce((sum, f) => sum + f.file_size, 0);

      // Confirm deletion
      Alert.alert(
        'Delete Large Files',
        `Are you sure you want to delete ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}? This will free up ${formatBytes(totalSize)}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                // Delete from database (soft delete)
                for (const file of selectedFiles) {
                  await PhotoQueries.deletePhoto(file.id);
                }

                // Record cleanup in usage limits
                await usageManager.recordCleanup(selectedFiles.length);

                // Reload files
                await loadLargeFiles();

                Alert.alert('Success', `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} deleted, ${formatBytes(totalSize)} freed!`);
              } catch (err) {
                console.error('Error deleting files:', err);
                Alert.alert('Error', 'Failed to delete files. Please try again.');
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

  // Load files on mount
  useEffect(() => {
    loadLargeFiles();
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadLargeFiles();
    }, [])
  );

  const filteredFiles = files.filter(f =>
    filterType === 'all' ? true : f.media_type === filterType
  );

  const toggleSelection = (id: string) => {
    setFiles(files.map(f =>
      f.id === id ? { ...f, selected: !f.selected } : f
    ));
  };

  const selectedFiles = files.filter(f => f.selected);
  const totalSelectedSize = selectedFiles.reduce((sum, f) => sum + f.file_size, 0);

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading large files..." />
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Large Files"
          message={error}
          onRetry={loadLargeFiles}
        />
      </View>
    );
  }

  // Show empty state
  if (files.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <EmptyState
          icon="📁"
          title="No Large Files Found"
          message="Great! You don't have any files larger than 5MB. Run a scan from the Dashboard to analyze your photo library."
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
      {/* Filter Bar */}
      <View className="bg-white p-3 border-b border-gray-200">
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={() => setFilterType('all')}
            className={`flex-1 py-2 rounded-lg ${filterType === 'all' ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <Text className={`text-center font-semibold ${filterType === 'all' ? 'text-white' : 'text-gray-700'}`}>
              All ({files.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilterType('photo')}
            className={`flex-1 py-2 rounded-lg ${filterType === 'photo' ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <Text className={`text-center font-semibold ${filterType === 'photo' ? 'text-white' : 'text-gray-700'}`}>
              Photos ({files.filter(f => f.media_type === 'photo').length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilterType('video')}
            className={`flex-1 py-2 rounded-lg ${filterType === 'video' ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <Text className={`text-center font-semibold ${filterType === 'video' ? 'text-white' : 'text-gray-700'}`}>
              Videos ({files.filter(f => f.media_type === 'video').length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1">
        {filteredFiles.map((file) => (
          <TouchableOpacity
            key={file.id}
            onPress={() => toggleSelection(file.id)}
            className="bg-white m-3 p-4 rounded-xl shadow-sm flex-row"
          >
            {/* Thumbnail */}
            <View className="relative">
              <Image
                source={{ uri: file.uri }}
                className="w-20 h-20 rounded-lg"
                resizeMode="cover"
              />
              {file.media_type === 'video' && (
                <View className="absolute inset-0 items-center justify-center">
                  <View className="bg-black/60 rounded-full w-8 h-8 items-center justify-center">
                    <Text className="text-white font-bold">▶</Text>
                  </View>
                </View>
              )}
              {file.selected && (
                <View className="absolute top-1 right-1 bg-blue-600 rounded-full w-6 h-6 items-center justify-center">
                  <Text className="text-white text-xs font-bold">✓</Text>
                </View>
              )}
            </View>

            {/* File Info */}
            <View className="flex-1 ml-3">
              <Text className="font-semibold text-gray-800 mb-1">{file.filename}</Text>
              <Text className="text-sm text-gray-500 mb-2">
                {file.creation_time ? new Date(file.creation_time * 1000).toLocaleDateString() : 'Unknown date'}
              </Text>

              {/* Size Badge */}
              <View className="flex-row items-center">
                <View className={`${getSizeBadgeColor(file.file_size)} px-3 py-1 rounded-full`}>
                  <Text className={`${getSizeColor(file.file_size)} font-bold`}>
                    {formatBytes(file.file_size)}
                  </Text>
                </View>

                {/* Pro Feature Badge - Compression (not yet implemented) */}
                <View className="ml-2 bg-blue-100 px-3 py-1 rounded-full flex-row items-center">
                  <Text className="text-blue-700 text-sm font-semibold">
                    Compression
                  </Text>
                  <View className="ml-1 bg-blue-600 px-1.5 py-0.5 rounded">
                    <Text className="text-white text-xs font-bold">PRO</Text>
                  </View>
                </View>
              </View>

              {/* Info text */}
              <Text className="text-xs text-gray-500 mt-1">
                {file.media_type === 'photo' ? 'Photo' : 'Video'} • {formatBytes(file.file_size)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {filteredFiles.length === 0 && (
          <View className="items-center justify-center p-10">
            <Text className="text-gray-400 text-lg">No large files found</Text>
          </View>
        )}
      </ScrollView>

      {/* Action Bar */}
      {selectedFiles.length > 0 && (
        <View className="bg-white border-t border-gray-200 p-4">
          <View className="mb-3">
            <Text className="text-gray-600 text-sm">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </Text>
            <Text className="font-bold text-gray-800 text-lg">
              {formatBytes(totalSelectedSize)} total
            </Text>
            <Text className="text-green-600 text-sm">
              Free up space by deleting these files
            </Text>
          </View>

          <View className="flex-row space-x-2">
            <TouchableOpacity
              className="flex-1 bg-green-600 py-3 rounded-lg"
              onPress={() => navigation.navigate('Paywall')}
            >
              <Text className="text-white text-center font-bold">
                Compress (Pro)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-red-600 py-3 rounded-lg"
              onPress={handleDelete}
            >
              <Text className="text-white text-center font-bold">
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
