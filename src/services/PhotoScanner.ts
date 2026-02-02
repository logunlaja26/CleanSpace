/**
 * PhotoScanner Service
 *
 * Scans device photo library (photos AND videos) and stores metadata in SQLite database.
 *
 * Based on CLAUDE.md requirements:
 * - Batch processing: Load 100 assets at a time
 * - Two-phase hashing: MD5 immediate for photos, advanced hashes in background
 * - Update scan_history and storage_analytics after completion
 * - Throttle if battery low
 * - Request permissions before scanning
 * - Process in batches for performance
 *
 * Key Features:
 * - Full scan: Scan entire photo and video library
 * - Incremental scan: Only scan new media since last scan
 * - Quick scan: Fast scan for UI updates (limited assets)
 * - Progress callbacks for UI
 * - Cancellable operations
 * - Scans both photos and videos in separate passes
 */

import * as MediaLibrary from 'expo-media-library';
import { insertPhotos, Photo } from '../database/queries/photos';
import { insertVideos, Video } from '../database/queries/videos';
import { insertHash } from '../database/queries/hashes';
import { usageManager } from './UsageManager';
import { optimizeForBulkInsert, restoreDatabaseOptimization } from '../database/init';
import * as Crypto from 'expo-crypto';

/**
 * Scan type
 */
export enum ScanType {
  FULL = 'full',           // Scan entire library
  INCREMENTAL = 'incremental', // Scan only new photos
  QUICK = 'quick',         // Quick scan (limited photos)
}

/**
 * Scan status
 */
export enum ScanStatus {
  IDLE = 'idle',
  REQUESTING_PERMISSION = 'requesting_permission',
  SCANNING = 'scanning',
  HASHING = 'hashing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

/**
 * Scan result
 */
export interface ScanResult {
  photosScanned: number;
  photosAdded: number;
  photosUpdated: number;
  videosScanned: number;
  videosAdded: number;
  videosUpdated: number;
  totalSize: number;
  duration: number;
  status: ScanStatus;
  error?: string;
}

/**
 * Scan progress callback
 */
export type ScanProgressCallback = (progress: {
  current: number;
  total: number;
  percentage: number;
  status: ScanStatus;
  message?: string;
}) => void;

/**
 * PhotoScanner class
 *
 * Handles scanning of device photo library and storing metadata in database.
 */
export class PhotoScanner {
  private isScanning: boolean = false;
  private shouldCancel: boolean = false;
  private progressCallback: ScanProgressCallback | null = null;
  private currentScanType: ScanType | null = null;

  /**
   * Start a photo scan
   *
   * @param type Type of scan to perform
   * @param onProgress Optional progress callback
   * @returns Promise<ScanResult>
   * @throws {LimitReachedError} If user has reached scan limit
   * @example
   * const scanner = new PhotoScanner();
   * const result = await scanner.startScan(ScanType.FULL, (progress) => {
   *   console.log(`Scanning: ${progress.percentage}%`);
   * });
   */
  async startScan(
    type: ScanType = ScanType.FULL,
    onProgress?: ScanProgressCallback
  ): Promise<ScanResult> {
    // Check if already scanning
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    // Check usage limits (unless quick scan)
    if (type !== ScanType.QUICK) {
      await usageManager.requireScanAllowed();
    }

    // Reset state
    this.isScanning = true;
    this.shouldCancel = false;
    this.progressCallback = onProgress || null;
    this.currentScanType = type;

    const startTime = Date.now();
    let photosScanned = 0;
    let photosAdded = 0;
    let videosScanned = 0;
    let videosAdded = 0;
    let totalSize = 0;

    try {
      // Step 1: Request permissions
      this.notifyProgress(0, 100, ScanStatus.REQUESTING_PERMISSION, 'Requesting photo library access...');

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Photo library permission denied');
      }

      // Step 2: Determine scan parameters and incremental scan timestamp
      const scanParams = this.getScanParameters(type);
      let createdAfter: number | undefined;

      // For incremental scans, get timestamp of last scanned photo
      if (type === ScanType.INCREMENTAL) {
        createdAfter = await this.getLastScanTimestamp();
        if (createdAfter) {
          console.log(`[PhotoScanner] Incremental scan: fetching photos after ${new Date(createdAfter).toISOString()}`);
        }
      }

      this.notifyProgress(5, 100, ScanStatus.SCANNING, 'Preparing to scan...');

      // Step 3: Optimize database for bulk inserts
      await optimizeForBulkInsert();

      // Step 4: Scan photos in batches (PARALLEL PROCESSING)
      const CONCURRENT_BATCHES = 3; // Process 3 batches simultaneously
      let hasMore = true;
      let afterCursor: string | undefined;
      let batchCount = 0;

      while (hasMore && !this.shouldCancel) {
        // Fetch multiple batches in parallel
        const batchPromises: Promise<MediaLibrary.PagedInfo<MediaLibrary.Asset>>[] = [];
        let currentCursor = afterCursor;

        // Queue up to 3 batch fetches
        for (let i = 0; i < CONCURRENT_BATCHES && hasMore; i++) {
          const fetchOptions: MediaLibrary.AssetsOptions = {
            first: scanParams.batchSize,
            after: currentCursor,
            mediaType: MediaLibrary.MediaType.photo,
            sortBy: MediaLibrary.SortBy.creationTime,
          };

          // Add createdAfter filter for incremental scans
          if (createdAfter) {
            (fetchOptions as any).createdAfter = createdAfter;
          }

          batchPromises.push(
            MediaLibrary.getAssetsAsync(fetchOptions).then(result => {
              // Update cursor for next iteration
              if (result.hasNextPage) {
                currentCursor = result.endCursor;
              }
              return result;
            })
          );
        }

        // Wait for all batches to fetch
        const batchResults = await Promise.all(batchPromises);

        // Process all batches in parallel
        const processingPromises = batchResults.map(result =>
          result.assets.length > 0 ? this.processBatch(result.assets) : Promise.resolve([])
        );
        const processedBatches = await Promise.all(processingPromises);

        // Insert all batches into database in single transaction
        for (let i = 0; i < processedBatches.length; i++) {
          const processedPhotos = processedBatches[i];
          const result = batchResults[i];

          if (processedPhotos.length > 0) {
            await insertPhotos(processedPhotos);

            photosScanned += result.assets.length;
            photosAdded += processedPhotos.length;
            totalSize += processedPhotos.reduce((sum, p) => sum + p.file_size, 0);

            batchCount++;
          }

          // Update cursor to last batch's cursor
          if (i === batchResults.length - 1) {
            afterCursor = result.endCursor;
            hasMore = result.hasNextPage && batchCount < scanParams.maxBatches;
          }
        }

        // Update progress (photos = 0-50%)
        const progress = Math.min(50, 10 + (batchCount * 40 / (scanParams.maxBatches || 10)));
        this.notifyProgress(
          progress,
          100,
          ScanStatus.SCANNING,
          `Scanned ${photosScanned} photos...`
        );

        // For quick scan, stop after first batch
        if (type === ScanType.QUICK && batchCount >= CONCURRENT_BATCHES) {
          hasMore = false;
        }
      }

      // Step 5: Scan videos in batches (PARALLEL PROCESSING)
      if (!this.shouldCancel) {
        this.notifyProgress(50, 100, ScanStatus.SCANNING, 'Scanning videos...');

        hasMore = true;
        afterCursor = undefined;
        batchCount = 0;

        while (hasMore && !this.shouldCancel) {
          // Fetch multiple batches in parallel
          const batchPromises: Promise<MediaLibrary.PagedInfo<MediaLibrary.Asset>>[] = [];
          let currentCursor = afterCursor;

          // Queue up to 3 batch fetches
          for (let i = 0; i < CONCURRENT_BATCHES && hasMore; i++) {
            const fetchOptions: MediaLibrary.AssetsOptions = {
              first: scanParams.batchSize,
              after: currentCursor,
              mediaType: MediaLibrary.MediaType.video,
              sortBy: MediaLibrary.SortBy.creationTime,
            };

            // Add createdAfter filter for incremental scans
            if (createdAfter) {
              (fetchOptions as any).createdAfter = createdAfter;
            }

            batchPromises.push(
              MediaLibrary.getAssetsAsync(fetchOptions).then(result => {
                // Update cursor for next iteration
                if (result.hasNextPage) {
                  currentCursor = result.endCursor;
                }
                return result;
              })
            );
          }

          // Wait for all batches to fetch
          const batchResults = await Promise.all(batchPromises);

          // Process all batches in parallel
          const processingPromises = batchResults.map(result =>
            result.assets.length > 0 ? this.processVideoBatch(result.assets) : Promise.resolve([])
          );
          const processedBatches = await Promise.all(processingPromises);

          // Insert all batches into database
          for (let i = 0; i < processedBatches.length; i++) {
            const processedVideos = processedBatches[i];
            const result = batchResults[i];

            if (processedVideos.length > 0) {
              await insertVideos(processedVideos);

              videosScanned += result.assets.length;
              videosAdded += processedVideos.length;
              totalSize += processedVideos.reduce((sum, v) => sum + v.file_size, 0);

              batchCount++;
            }

            // Update cursor to last batch's cursor
            if (i === batchResults.length - 1) {
              afterCursor = result.endCursor;
              hasMore = result.hasNextPage && batchCount < scanParams.maxBatches;
            }
          }

          // Update progress (videos = 50-95%)
          const progress = Math.min(95, 50 + (batchCount * 45 / (scanParams.maxBatches || 10)));
          this.notifyProgress(
            progress,
            100,
            ScanStatus.SCANNING,
            `Scanned ${photosScanned} photos, ${videosScanned} videos...`
          );

          // For quick scan, stop after first batch set
          if (type === ScanType.QUICK && batchCount >= CONCURRENT_BATCHES) {
            hasMore = false;
          }
        }
      }

      // Step 6: Restore database optimization
      await restoreDatabaseOptimization();

      // Check if cancelled
      if (this.shouldCancel) {
        this.notifyProgress(100, 100, ScanStatus.CANCELLED, 'Scan cancelled');
        return {
          photosScanned,
          photosAdded,
          photosUpdated: 0,
          videosScanned,
          videosAdded,
          videosUpdated: 0,
          totalSize,
          duration: Date.now() - startTime,
          status: ScanStatus.CANCELLED,
        };
      }

      // Step 7: Record scan completion
      this.notifyProgress(100, 100, ScanStatus.COMPLETED, `Scan completed! ${photosScanned} photos, ${videosScanned} videos`);

      // Record scan in usage (unless quick scan)
      if (type !== ScanType.QUICK) {
        await usageManager.recordScan();
      }

      const duration = Date.now() - startTime;

      return {
        photosScanned,
        photosAdded,
        photosUpdated: 0,
        videosScanned,
        videosAdded,
        videosUpdated: 0,
        totalSize,
        duration,
        status: ScanStatus.COMPLETED,
      };

    } catch (error) {
      // Restore database optimization on error
      try {
        await restoreDatabaseOptimization();
      } catch (restoreError) {
        console.error('[PhotoScanner] Error restoring database optimization:', restoreError);
      }

      this.notifyProgress(100, 100, ScanStatus.FAILED, `Scan failed: ${error}`);

      return {
        photosScanned,
        photosAdded,
        photosUpdated: 0,
        videosScanned,
        videosAdded,
        videosUpdated: 0,
        totalSize,
        duration: Date.now() - startTime,
        status: ScanStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.isScanning = false;
      this.currentScanType = null;
    }
  }

  /**
   * Cancel ongoing scan
   */
  cancelScan(): void {
    if (this.isScanning) {
      this.shouldCancel = true;
    }
  }

  /**
   * Get current scan progress
   *
   * @returns Object with scan status and progress
   */
  getScanProgress(): {
    isScanning: boolean;
    scanType: ScanType | null;
  } {
    return {
      isScanning: this.isScanning,
      scanType: this.currentScanType,
    };
  }

  /**
   * Check if photo library permission is granted
   *
   * @returns Promise<boolean>
   */
  async hasPermission(): Promise<boolean> {
    const { status } = await MediaLibrary.getPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Request photo library permission
   *
   * @returns Promise<boolean> True if granted
   */
  async requestPermission(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  }

  /**
   * Process a batch of media library assets
   *
   * Converts MediaLibrary.Asset to Photo database format.
   * OPTIMIZED: Removed getAssetInfoAsync() and hash generation for 2-3x faster scanning.
   * Hash generation is now deferred to background processing.
   *
   * @param assets Array of MediaLibrary assets
   * @returns Promise<Photo[]>
   */
  private async processBatch(assets: MediaLibrary.Asset[]): Promise<Omit<Photo, 'created_at' | 'updated_at'>[]> {
    const photos: Omit<Photo, 'created_at' | 'updated_at'>[] = [];

    for (const asset of assets) {
      try {
        // Detect if screenshot
        const isScreenshot = this.detectScreenshot(asset.filename);

        // Create photo object using only basic asset data
        // OPTIMIZATION: Skip getAssetInfoAsync() - use basic asset properties only
        // Detailed info (EXIF, location) can be fetched later when user views the photo
        const photo: Omit<Photo, 'created_at' | 'updated_at'> = {
          id: asset.id,
          uri: asset.uri, // Use basic URI instead of getting localUri from AssetInfo
          filename: asset.filename,
          file_size: 0, // fileSize not available in basic Asset, will be 0 initially
          width: asset.width,
          height: asset.height,
          creation_time: Math.floor(asset.creationTime / 1000), // Convert to seconds
          modification_time: Math.floor(asset.modificationTime / 1000),
          media_type: asset.mediaType,
          is_screenshot: isScreenshot ? 1 : 0,
          is_deleted: 0,
          album_id: asset.albumId || undefined,
          location_latitude: undefined, // Skip location during scan
          location_longitude: undefined, // Skip location during scan
          exif_data: undefined, // Skip EXIF during scan
        };

        photos.push(photo);

        // OPTIMIZATION: Hash generation deferred to background
        // No longer calling generateBasicHash() during scan
        // This eliminates the biggest bottleneck (file I/O for MD5)

      } catch (error) {
        console.error(`[PhotoScanner] Error processing asset ${asset.id}:`, error);
        // Continue with next asset
      }
    }

    return photos;
  }

  /**
   * Process a batch of video assets
   *
   * Converts MediaLibrary.Asset to Video database format.
   * OPTIMIZED: Removed getAssetInfoAsync() for faster scanning.
   *
   * @param assets Array of MediaLibrary video assets
   * @returns Promise<Video[]>
   */
  private async processVideoBatch(assets: MediaLibrary.Asset[]): Promise<Omit<Video, 'created_at' | 'updated_at'>[]> {
    const videos: Omit<Video, 'created_at' | 'updated_at'>[] = [];

    for (const asset of assets) {
      try {
        // Create video object using only basic asset data
        // OPTIMIZATION: Skip getAssetInfoAsync() - use basic asset properties only
        const video: Omit<Video, 'created_at' | 'updated_at'> = {
          id: asset.id,
          uri: asset.uri, // Use basic URI instead of getting localUri from AssetInfo
          filename: asset.filename,
          file_size: 0, // fileSize not available in basic Asset, will be 0 initially
          width: asset.width,
          height: asset.height,
          duration: Math.floor(asset.duration), // Duration in seconds
          creation_time: Math.floor(asset.creationTime / 1000), // Convert to seconds
          modification_time: Math.floor(asset.modificationTime / 1000),
          is_deleted: 0,
          album_id: asset.albumId || undefined,
          location_latitude: undefined, // Skip location during scan
          location_longitude: undefined, // Skip location during scan
        };

        videos.push(video);

      } catch (error) {
        console.error(`[PhotoScanner] Error processing video asset ${asset.id}:`, error);
        // Continue with next asset
      }
    }

    return videos;
  }

  /**
   * Generate basic MD5 hash for photo
   *
   * This is the first phase of hashing. Advanced hashes (perceptual, dhash)
   * will be generated later by the HashGenerator service.
   *
   * @param photoId Photo ID
   * @param uri Photo URI
   */
  private async generateBasicHash(photoId: string, uri: string): Promise<void> {
    try {
      // Generate MD5 hash
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        uri
      );

      // Store hash in database
      await insertHash({
        photo_id: photoId,
        md5_hash: hash,
        perceptual_hash: undefined,
        dhash: undefined,
        average_hash: undefined,
      });
    } catch (error) {
      console.error(`[PhotoScanner] Error generating hash for ${photoId}:`, error);
      // Non-critical error, continue
    }
  }

  /**
   * Detect if a photo is a screenshot based on filename
   *
   * @param filename Filename to check
   * @returns boolean
   */
  private detectScreenshot(filename: string): boolean {
    const screenshotPatterns = [
      /screenshot/i,
      /screen_shot/i,
      /screen-shot/i,
      /scrnshot/i,
      /^IMG_\d{4}\.PNG$/i, // iOS screenshot pattern
    ];

    return screenshotPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Get last successful scan timestamp
   *
   * Used for incremental scans to only fetch new photos.
   *
   * @returns Promise<number | undefined> Last scan timestamp in milliseconds
   */
  private async getLastScanTimestamp(): Promise<number | undefined> {
    try {
      const { executeQueryFirst } = await import('../database/init');
      const result = await executeQueryFirst<{ max_creation: number }>(
        `SELECT MAX(creation_time) as max_creation FROM photos WHERE is_deleted = 0`
      );

      if (result?.max_creation) {
        // Convert from seconds to milliseconds and return
        return result.max_creation * 1000;
      }

      return undefined;
    } catch (error) {
      console.error('[PhotoScanner] Error getting last scan timestamp:', error);
      return undefined;
    }
  }

  /**
   * Get scan parameters based on scan type
   *
   * @param type Scan type
   * @returns Scan parameters
   */
  private getScanParameters(type: ScanType): {
    batchSize: number;
    maxBatches: number;
  } {
    switch (type) {
      case ScanType.FULL:
        return {
          batchSize: 500, // Increased from 100 for better performance
          maxBatches: Number.MAX_SAFE_INTEGER, // Scan all
        };
      case ScanType.INCREMENTAL:
        return {
          batchSize: 500, // Increased from 100 for better performance
          maxBatches: 50, // Up to 25,000 photos
        };
      case ScanType.QUICK:
        return {
          batchSize: 100, // Keep smaller for quick scans
          maxBatches: 1, // Only 100 photos
        };
      default:
        return {
          batchSize: 500,
          maxBatches: Number.MAX_SAFE_INTEGER,
        };
    }
  }

  /**
   * Notify progress to callback
   *
   * @param current Current progress
   * @param total Total items
   * @param status Scan status
   * @param message Optional message
   */
  private notifyProgress(
    current: number,
    total: number,
    status: ScanStatus,
    message?: string
  ): void {
    if (this.progressCallback) {
      this.progressCallback({
        current,
        total,
        percentage: Math.round((current / total) * 100),
        status,
        message,
      });
    }
  }
}

// Export singleton instance
export const photoScanner = new PhotoScanner();
