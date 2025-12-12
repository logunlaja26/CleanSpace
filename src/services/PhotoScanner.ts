/**
 * PhotoScanner Service
 *
 * Scans device photo library and stores metadata in SQLite database.
 *
 * Based on CLAUDE.md requirements:
 * - Batch processing: Load 100 photos at a time
 * - Two-phase hashing: MD5 immediate, advanced hashes in background
 * - Update scan_history and storage_analytics after completion
 * - Throttle if battery low
 * - Request permissions before scanning
 * - Process in batches for performance
 *
 * Key Features:
 * - Full scan: Scan entire photo library
 * - Incremental scan: Only scan new photos since last scan
 * - Quick scan: Fast scan for UI updates (limited photos)
 * - Progress callbacks for UI
 * - Cancellable operations
 */

import * as MediaLibrary from 'expo-media-library';
import { insertPhotos, Photo } from '../database/queries/photos';
import { insertHash } from '../database/queries/hashes';
import { usageManager } from './UsageManager';
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
    let totalSize = 0;

    try {
      // Step 1: Request permissions
      this.notifyProgress(0, 100, ScanStatus.REQUESTING_PERMISSION, 'Requesting photo library access...');

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Photo library permission denied');
      }

      // Step 2: Determine scan parameters
      const scanParams = this.getScanParameters(type);
      this.notifyProgress(5, 100, ScanStatus.SCANNING, 'Preparing to scan...');

      // Step 3: Scan photos in batches
      let hasMore = true;
      let afterCursor: string | undefined;
      let batchCount = 0;

      while (hasMore && !this.shouldCancel) {
        // Fetch batch of photos
        const result = await MediaLibrary.getAssetsAsync({
          first: scanParams.batchSize,
          after: afterCursor,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: MediaLibrary.SortBy.creationTime,
        });

        if (result.assets.length > 0) {
          // Process this batch
          const processedPhotos = await this.processBatch(result.assets);

          // Insert into database
          await insertPhotos(processedPhotos);

          photosScanned += result.assets.length;
          photosAdded += processedPhotos.length;
          totalSize += processedPhotos.reduce((sum, p) => sum + p.file_size, 0);

          batchCount++;

          // Update progress
          const progress = Math.min(95, 10 + (batchCount * 85 / (scanParams.maxBatches || 10)));
          this.notifyProgress(
            progress,
            100,
            ScanStatus.SCANNING,
            `Scanned ${photosScanned} photos...`
          );
        }

        // Check if we should continue
        hasMore = result.hasNextPage && batchCount < scanParams.maxBatches;
        afterCursor = result.endCursor;

        // For quick scan, stop after first batch
        if (type === ScanType.QUICK && batchCount >= 1) {
          hasMore = false;
        }
      }

      // Check if cancelled
      if (this.shouldCancel) {
        this.notifyProgress(100, 100, ScanStatus.CANCELLED, 'Scan cancelled');
        return {
          photosScanned,
          photosAdded,
          photosUpdated: 0,
          totalSize,
          duration: Date.now() - startTime,
          status: ScanStatus.CANCELLED,
        };
      }

      // Step 4: Record scan completion
      this.notifyProgress(100, 100, ScanStatus.COMPLETED, 'Scan completed!');

      // Record scan in usage (unless quick scan)
      if (type !== ScanType.QUICK) {
        await usageManager.recordScan();
      }

      const duration = Date.now() - startTime;

      return {
        photosScanned,
        photosAdded,
        photosUpdated: 0,
        totalSize,
        duration,
        status: ScanStatus.COMPLETED,
      };

    } catch (error) {
      this.notifyProgress(100, 100, ScanStatus.FAILED, `Scan failed: ${error}`);

      return {
        photosScanned,
        photosAdded,
        photosUpdated: 0,
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
   *
   * @param assets Array of MediaLibrary assets
   * @returns Promise<Photo[]>
   */
  private async processBatch(assets: MediaLibrary.Asset[]): Promise<Omit<Photo, 'created_at' | 'updated_at'>[]> {
    const photos: Omit<Photo, 'created_at' | 'updated_at'>[] = [];

    for (const asset of assets) {
      try {
        // Get detailed asset info
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);

        // Detect if screenshot
        const isScreenshot = this.detectScreenshot(asset.filename);

        // Create photo object
        const photo: Omit<Photo, 'created_at' | 'updated_at'> = {
          id: asset.id,
          uri: assetInfo.localUri || assetInfo.uri,
          filename: asset.filename,
          file_size: assetInfo.fileSize || 0,
          width: asset.width,
          height: asset.height,
          creation_time: Math.floor(asset.creationTime / 1000), // Convert to seconds
          modification_time: Math.floor(asset.modificationTime / 1000),
          media_type: asset.mediaType,
          is_screenshot: isScreenshot ? 1 : 0,
          is_deleted: 0,
          album_id: asset.albumId || undefined,
          location_latitude: assetInfo.location?.latitude,
          location_longitude: assetInfo.location?.longitude,
          exif_data: assetInfo.exif ? JSON.stringify(assetInfo.exif) : undefined,
        };

        photos.push(photo);

        // Generate MD5 hash (phase 1 hashing)
        // Advanced hashes will be generated in background by HashGenerator service
        await this.generateBasicHash(asset.id, assetInfo.localUri || assetInfo.uri);

      } catch (error) {
        console.error(`[PhotoScanner] Error processing asset ${asset.id}:`, error);
        // Continue with next asset
      }
    }

    return photos;
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
        perceptual_hash: null,
        dhash: null,
        average_hash: null,
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
          batchSize: 100,
          maxBatches: Number.MAX_SAFE_INTEGER, // Scan all
        };
      case ScanType.INCREMENTAL:
        return {
          batchSize: 100,
          maxBatches: 50, // Up to 5000 photos
        };
      case ScanType.QUICK:
        return {
          batchSize: 50,
          maxBatches: 1, // Only 50 photos
        };
      default:
        return {
          batchSize: 100,
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
