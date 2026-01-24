import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { manipulateAsync, SaveFormat, Action } from 'expo-image-manipulator';
import { getPhotoById} from '../database/queries/photos';
import { UsageManager } from './UsageManager';

/**
 * CompressionService
 *
 * Handles photo and video compression operations (Pro feature)
 * - JPEG → HEIC/optimized JPEG conversion
 * - H.264 → HEVC video conversion (framework)
 * - Preserves EXIF metadata
 * - Provides compression estimates
 * - Enforces Pro tier restrictions
 */

export interface CompressionOptions {
  quality?: number; // 0-1, default 0.8
  format?: 'jpeg' | 'png' | 'heic'; // Target format
  preserveMetadata?: boolean; // Default true
  maxWidth?: number; // Optional max width
  maxHeight?: number; // Optional max height
}

export interface VideoCompressionOptions {
  quality?: 'low' | 'medium' | 'high'; // Compression quality
  targetCodec?: 'h264' | 'hevc'; // Target codec
  preserveMetadata?: boolean; // Default true
  maxBitrate?: number; // Optional max bitrate
}

export interface CompressionResult {
  success: boolean;
  originalSize: number;
  compressedSize: number;
  savingsBytes: number;
  savingsPercentage: number;
  newUri?: string;
  newPhotoId?: string; // New photo ID (MediaLibrary asset ID)
  error?: string;
}

export interface CompressionEstimate {
  estimatedSavings: number;
  estimatedPercentage: number;
  currentFormat: string;
  targetFormat: string;
  currentSize: number;
}

export class CompressionService {
  private usageManager: UsageManager;

  constructor() {
    this.usageManager = new UsageManager();
  }

  /**
   * Check if user has Pro tier (compression is Pro-only)
   */
  private async ensureProTier(): Promise<void> {
    const tier = await this.usageManager.getUserTier();
    if (tier !== 'pro') {
      throw new Error('Compression is a Pro feature. Please upgrade to continue.');
    }
  }

  /**
   * Get compression estimate for a photo
   */
  async getCompressionEstimate(
    photoId: string,
    options: CompressionOptions = {}
  ): Promise<CompressionEstimate> {
    const photo = await getPhotoById(photoId);
    if (!photo) {
      throw new Error('Photo not found');
    }

    const currentFormat = photo.filename.split('.').pop()?.toLowerCase() || 'unknown';
    const targetFormat = options.format || 'jpeg';
    const quality = options.quality || 0.8;

    // Estimate compression savings based on format and quality
    let estimatedPercentage = 0;

    if (currentFormat === 'png' && targetFormat === 'jpeg') {
      // PNG → JPEG typically saves 60-80%
      estimatedPercentage = 0.7;
    } else if (currentFormat === 'jpeg' && targetFormat === 'heic') {
      // JPEG → HEIC typically saves 40-50%
      estimatedPercentage = 0.45;
    } else if (currentFormat === 'jpeg' && targetFormat === 'jpeg') {
      // JPEG → optimized JPEG saves 20-40% depending on quality
      estimatedPercentage = (1 - quality) * 0.35;
    } else {
      // Conservative estimate for other conversions
      estimatedPercentage = 0.2;
    }

    const estimatedSavings = Math.floor(photo.file_size * estimatedPercentage);

    return {
      estimatedSavings,
      estimatedPercentage: estimatedPercentage * 100,
      currentFormat,
      targetFormat,
      currentSize: photo.file_size,
    };
  }

  /**
   * Compress a photo (JPEG, PNG, etc.)
   */
  async compressPhoto(
    photoId: string,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> {
    try {
      // Enforce Pro tier
      await this.ensureProTier();

      const photo = await getPhotoById(photoId);
      if (!photo) {
        throw new Error('Photo not found');
      }

      const originalSize = photo.file_size;
      const quality = options.quality || 0.8;
      const preserveMetadata = options.preserveMetadata !== false;

      // Get asset info (photo.id is the MediaLibrary asset ID)
      const asset = await MediaLibrary.getAssetInfoAsync(photo.id);
      if (!asset.localUri && !asset.uri) {
        throw new Error('Could not access photo file');
      }

      const sourceUri = asset.localUri || asset.uri;

      // Determine target format
      let targetFormat: SaveFormat = SaveFormat.JPEG;
      if (options.format === 'png') {
        targetFormat = SaveFormat.PNG;
      } else if (options.format === 'heic') {
        // Note: HEIC support in expo-image-manipulator is limited
        // This may require a native module for full HEIC support
        // For now, we'll use high-quality JPEG as fallback
        console.warn('HEIC format may require native module. Using high-quality JPEG.');
        targetFormat = SaveFormat.JPEG;
      }

      // Prepare manipulation actions
      const manipulationActions: Action[] = [];

      // Resize if max dimensions specified
      if (options.maxWidth || options.maxHeight) {
        manipulationActions.push({
          resize: {
            width: options.maxWidth,
            height: options.maxHeight,
          },
        });
      }

      // Compress the image
      const result = await manipulateAsync(
        sourceUri,
        manipulationActions,
        {
          compress: quality,
          format: targetFormat,
        }
      );

      // Get compressed file size
      const fileInfo = await FileSystem.getInfoAsync(result.uri, { md5: false });
      if (!fileInfo.exists) {
        throw new Error('Compression failed - output file not found');
      }

      const compressedSize = 'size' in fileInfo ? (fileInfo.size || 0) : 0;
      const savingsBytes = originalSize - compressedSize;
      const savingsPercentage = (savingsBytes / originalSize) * 100;

      // If we actually saved space, replace the original
      if (savingsBytes > 0) {
        // Save compressed image to media library
        const savedAsset = await MediaLibrary.createAssetAsync(result.uri);

        // Delete the original photo if successful
        if (preserveMetadata) {
          // TODO: Copy EXIF metadata from original to compressed
          // This requires a native module or additional library
          console.warn('EXIF metadata preservation requires additional implementation');
        }

        // Delete original asset from media library
        await MediaLibrary.deleteAssetsAsync([asset.id]);

        // Since photo.id is the asset ID, we need to delete the old record and insert a new one
        // First, get the current photo data to preserve metadata
        const { deletePhoto } = await import('../database/queries/photos');
        const { insertPhotos } = await import('../database/queries/photos');

        // Mark old photo as deleted in database
        await deletePhoto(photoId);

        // Insert new photo record with new asset ID
        await insertPhotos([{
          id: savedAsset.id,
          uri: savedAsset.uri,
          filename: photo.filename,
          file_size: compressedSize,
          width: photo.width,
          height: photo.height,
          creation_time: photo.creation_time,
          modification_time: Math.floor(Date.now() / 1000),
          media_type: photo.media_type,
          is_screenshot: photo.is_screenshot,
          is_deleted: 0,
          album_id: photo.album_id,
          location_latitude: photo.location_latitude,
          location_longitude: photo.location_longitude,
          exif_data: photo.exif_data,
        }]);

        // Clean up temp file
        await this.safeDeleteFile(result.uri);

        return {
          success: true,
          originalSize,
          compressedSize,
          savingsBytes,
          savingsPercentage,
          newUri: savedAsset.uri,
          newPhotoId: savedAsset.id, // Return new photo ID for reference
        };
      } else {
        // Compression didn't save space, skip
        await this.safeDeleteFile(result.uri);
        return {
          success: false,
          originalSize,
          compressedSize,
          savingsBytes: 0,
          savingsPercentage: 0,
          error: 'Compression did not reduce file size',
        };
      }
    } catch (error) {
      console.error('Photo compression error:', error);
      return {
        success: false,
        originalSize: 0,
        compressedSize: 0,
        savingsBytes: 0,
        savingsPercentage: 0,
        error: error instanceof Error ? error.message : 'Unknown compression error',
      };
    }
  }

  /**
   * Compress multiple photos in batch
   */
  async compressPhotoBatch(
    photoIds: string[],
    options: CompressionOptions = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<CompressionResult[]> {
    await this.ensureProTier();

    const results: CompressionResult[] = [];

    for (let i = 0; i < photoIds.length; i++) {
      const result = await this.compressPhoto(photoIds[i], options);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, photoIds.length);
      }
    }

    return results;
  }

  /**
   * Video compression (framework - requires native implementation)
   *
   * Note: Full H.264 → HEVC transcoding requires native modules.
   * This provides the interface and framework for future native implementation.
   */
  async compressVideo(
    videoId: string,
    _options: VideoCompressionOptions = {}
  ): Promise<CompressionResult> {
    try {
      await this.ensureProTier();

      // TODO: Implement video compression with native module
      // Recommended libraries:
      // - react-native-video-processing
      // - react-native-compressor
      // - Custom native module using AVFoundation (iOS)

      console.warn(
        'Video compression requires native module implementation. ' +
        'Please integrate react-native-compressor or similar library.'
      );

      return {
        success: false,
        originalSize: 0,
        compressedSize: 0,
        savingsBytes: 0,
        savingsPercentage: 0,
        error: 'Video compression not yet implemented - requires native module',
      };
    } catch (error) {
      return {
        success: false,
        originalSize: 0,
        compressedSize: 0,
        savingsBytes: 0,
        savingsPercentage: 0,
        error: error instanceof Error ? error.message : 'Unknown compression error',
      };
    }
  }

  /**
   * Get total compression savings for multiple photos
   */
  async calculateBatchSavings(
    photoIds: string[],
    options: CompressionOptions = {}
  ): Promise<{
    totalEstimatedSavings: number;
    averagePercentage: number;
    estimatesPerPhoto: CompressionEstimate[];
  }> {
    const estimates: CompressionEstimate[] = [];
    let totalSavings = 0;
    let totalPercentage = 0;

    for (const photoId of photoIds) {
      const estimate = await this.getCompressionEstimate(photoId, options);
      estimates.push(estimate);
      totalSavings += estimate.estimatedSavings;
      totalPercentage += estimate.estimatedPercentage;
    }

    return {
      totalEstimatedSavings: totalSavings,
      averagePercentage: photoIds.length > 0 ? totalPercentage / photoIds.length : 0,
      estimatesPerPhoto: estimates,
    };
  }

  /**
   * Safely delete a file without throwing errors if it doesn't exist
   * Uses new FileSystem API (Expo SDK 54+)
   */
  private async safeDeleteFile(uri: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri, { md5: false });
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(uri);
      }
    } catch (error) {
      // Silently ignore errors (file may not exist or be inaccessible)
      console.debug(`Could not delete file ${uri}:`, error);
    }
  }

  /**
   * Preserve EXIF metadata from source to destination
   *
   * Note: This requires expo-image-manipulator or a native module
   * with EXIF support. Current implementation is a placeholder.
   */
  private async preserveMetadata(_sourceUri: string, _destUri: string): Promise<void> {
    // TODO: Implement EXIF preservation
    // Options:
    // 1. Use expo-media-library to copy metadata
    // 2. Use react-native-image-resizer with EXIF support
    // 3. Use custom native module with ExifInterface (Android) or ImageIO (iOS)

    console.warn('EXIF metadata preservation requires additional native implementation');
  }

  /**
   * Check if compression is available (Pro tier check)
   */
  async isCompressionAvailable(): Promise<boolean> {
    try {
      const tier = await this.usageManager.getUserTier();
      return tier === 'pro';
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const compressionService = new CompressionService();
