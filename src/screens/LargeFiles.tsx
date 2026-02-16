import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState, EmptyState } from '../components';

// Database queries
import * as PhotoQueries from '../database/queries/photos';
import type { Photo } from '../database/queries/photos';
import { UsageManager } from '../services/UsageManager';
import { photoDeletionService } from '../services/PhotoDeletionService';
import { compressionService } from '../services/CompressionService';

// Utils
import { formatBytes } from '../utils/format';

type LargeFilesProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LargeFiles'>;
};

// Extended photo type with selection state
type LargeFileWithSelection = Photo & {
  selected: boolean;
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
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState({ current: 0, total: 0 });

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
                // Delete from device and database
                const fileIds = selectedFiles.map(f => f.id);
                const result = await photoDeletionService.deletePhotos(fileIds);

                if (!result.success && result.deletedCount === 0) {
                  Alert.alert('Error', 'Failed to delete files. Please try again.');
                  return;
                }

                // Record cleanup in usage limits for successfully deleted photos
                await usageManager.recordCleanup(result.deletedCount);

                // Reload files
                await loadLargeFiles();

                // Show appropriate message
                const message = result.success && result.deletedCount === selectedFiles.length
                  ? `${result.deletedCount} file${result.deletedCount > 1 ? 's' : ''} deleted, ${formatBytes(totalSize)} freed!`
                  : `${result.deletedCount} of ${selectedFiles.length} files deleted. Some deletions failed.`;

                Alert.alert(result.success ? 'Success' : 'Partial Success', message);
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

  /**
   * Compress selected files (Pro feature)
   */
  const handleCompress = async () => {
    try {
      const selectedFiles = files.filter(f => f.selected);

      if (selectedFiles.length === 0) {
        return;
      }

      // Check if user has Pro tier
      const isPro = await compressionService.isCompressionAvailable();
      if (!isPro) {
        Alert.alert(
          'Pro Feature',
          'Compression is a Pro feature. Upgrade to compress your photos and save even more space!',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Paywall') },
          ]
        );
        return;
      }

      // Filter out videos (not supported yet)
      const photoFiles = selectedFiles.filter(f => f.media_type === 'photo');
      const videoFiles = selectedFiles.filter(f => f.media_type === 'video');

      if (photoFiles.length === 0) {
        Alert.alert(
          'Videos Not Supported',
          'Video compression requires native implementation and is not yet available. Please select photos to compress.'
        );
        return;
      }

      if (videoFiles.length > 0) {
        Alert.alert(
          'Videos Skipped',
          `${videoFiles.length} video${videoFiles.length > 1 ? 's' : ''} will be skipped. Only ${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''} will be compressed.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => proceedWithCompression(photoFiles) },
          ]
        );
      } else {
        await proceedWithCompression(photoFiles);
      }
    } catch (err) {
      console.error('Error in compress handler:', err);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  /**
   * Proceed with compression after checks
   */
  const proceedWithCompression = async (photoFiles: LargeFileWithSelection[]) => {
    try {
      // Request delete permissions upfront (needed to replace originals with compressed versions)
      const { status } = await MediaLibrary.requestPermissionsAsync(true); // true = writeOnly
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'CleanSpace needs permission to modify your photo library to replace originals with compressed versions.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Get compression estimate
      const photoIds = photoFiles.map(f => f.id);
      const estimates = await compressionService.calculateBatchSavings(
        photoIds,
        { quality: 0.8, format: 'jpeg' }
      );

      // Show detailed estimate confirmation with clear explanation
      Alert.alert(
        'Compress & Replace Photos',
        `📊 Compression Details:\n` +
        `• ${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''} will be compressed\n` +
        `• Estimated savings: ${formatBytes(estimates.totalEstimatedSavings)} (${estimates.averagePercentage.toFixed(0)}%)\n` +
        `• Quality: High (80%) • Format: JPEG\n\n` +
        `⚠️ How it works:\n` +
        `Each original photo will be replaced with a smaller, compressed version. The compressed photos will look nearly identical but take up less space.\n\n` +
        `Note: You may see system prompts to confirm replacing the originals - this is normal and required for compression.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start Compression',
            onPress: async () => {
              try {
                setIsCompressing(true);
                setCompressionProgress({ current: 0, total: photoIds.length });

                // Compress photos in batch
                const results = await compressionService.compressPhotoBatch(
                  photoIds,
                  { quality: 0.8, format: 'jpeg' },
                  (current, total) => {
                    setCompressionProgress({ current, total });
                  }
                );

                // Calculate total savings
                const totalSaved = results.reduce((sum, r) => sum + r.savingsBytes, 0);
                const successCount = results.filter(r => r.success).length;
                const failedCount = results.length - successCount;

                setIsCompressing(false);

                // Show results
                const resultMessage = failedCount === 0
                  ? `${successCount} photo${successCount > 1 ? 's' : ''} compressed successfully!\n\n` +
                    `Space saved: ${formatBytes(totalSaved)}`
                  : `${successCount} of ${results.length} photos compressed.\n\n` +
                    `Space saved: ${formatBytes(totalSaved)}\n` +
                    `${failedCount} file${failedCount > 1 ? 's' : ''} could not be compressed.`;

                Alert.alert(
                  failedCount === 0 ? 'Compression Complete' : 'Partial Success',
                  resultMessage
                );

                // Reload files to show updated sizes
                await loadLargeFiles();
              } catch (err) {
                console.error('Error during compression:', err);
                setIsCompressing(false);
                Alert.alert('Error', 'Failed to compress photos. Please try again.');
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error getting compression estimate:', err);
      Alert.alert('Error', 'Failed to estimate compression savings.');
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

  // Set header with Swipe Mode button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('SwipeMode', { category: 'largeFiles', mediaType: 'photo' })}
          style={{ marginRight: 16 }}
        >
          <Ionicons name="swap-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
      {/* Compression Overlay */}
      {isCompressing && (
        <View className="absolute inset-0 bg-black/50 z-50 justify-center items-center">
          <View className="bg-white rounded-2xl p-6 mx-8 items-center">
            <LoadingSpinner size="large" />
            <Text className="text-lg font-bold text-gray-800 mt-4">
              Replacing with Compressed Versions
            </Text>
            <Text className="text-gray-600 mt-2">
              {compressionProgress.current} of {compressionProgress.total} photos
            </Text>
            <View className="w-full h-2 bg-gray-200 rounded-full mt-3 overflow-hidden">
              <View
                className="h-full bg-green-600"
                style={{
                  width: compressionProgress.total > 0
                    ? `${(compressionProgress.current / compressionProgress.total) * 100}%`
                    : '0%'
                }}
              />
            </View>
            <Text className="text-sm text-gray-500 mt-3 text-center">
              Compressing and replacing originals...{'\n'}
              You may see system prompts - this is normal.
            </Text>
          </View>
        </View>
      )}

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
            {isCompressing ? (
              <View className="mt-2">
                <Text className="text-green-600 text-sm font-semibold">
                  Replacing with compressed versions... {compressionProgress.current}/{compressionProgress.total}
                </Text>
                <View className="h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                  <View
                    className="h-full bg-green-600"
                    style={{
                      width: compressionProgress.total > 0
                        ? `${(compressionProgress.current / compressionProgress.total) * 100}%`
                        : '0%'
                    }}
                  />
                </View>
              </View>
            ) : (
              <Text className="text-green-600 text-sm">
                Save space by compressing or deleting these files
              </Text>
            )}
          </View>

          <View className="flex-row space-x-2">
            <TouchableOpacity
              className={`flex-1 py-3 rounded-lg ${isCompressing ? 'bg-gray-400' : 'bg-green-600'}`}
              onPress={handleCompress}
              disabled={isCompressing}
            >
              <Text className="text-white text-center font-bold">
                {isCompressing ? 'Replacing...' : 'Compress (Pro)'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-3 rounded-lg ${isCompressing ? 'bg-gray-400' : 'bg-red-600'}`}
              onPress={handleDelete}
              disabled={isCompressing}
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
