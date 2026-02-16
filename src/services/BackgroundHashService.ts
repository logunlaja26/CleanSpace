/**
 * Background Hash Generation Service
 *
 * Generates MD5 hashes for photos in the background after scanning.
 * This is part of the deferred hash generation optimization strategy.
 *
 * OPTIMIZATION STRATEGY:
 * - Phase 1 (Scan): Skip hash generation for 2-3x faster scanning
 * - Phase 2 (Background): Generate hashes when app is idle
 *
 * Usage:
 * 1. After scan completes, call backgroundHashService.startHashGeneration()
 * 2. Service will generate hashes in batches without blocking UI
 * 3. Monitor progress with onProgress callback
 */

import { executeQuery } from '../database/init';
import { insertHash, updateHash } from '../database/queries/hashes';
import { getPhotoById } from '../database/queries/photos';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

/**
 * Progress callback type
 */
export type HashProgressCallback = (progress: {
  current: number;
  total: number;
  percentage: number;
  message: string;
}) => void;

/**
 * Background Hash Service
 *
 * Generates hashes for photos that don't have them yet.
 */
export class BackgroundHashService {
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private progressCallback: HashProgressCallback | null = null;

  /**
   * Start background hash generation
   *
   * Generates MD5 hashes for all photos without hashes.
   * Runs in batches to avoid blocking the UI.
   *
   * @param batchSize Number of photos to process per batch (default: 50)
   * @param onProgress Optional progress callback
   * @returns Promise<number> Number of hashes generated
   */
  async startHashGeneration(
    batchSize: number = 50,
    onProgress?: HashProgressCallback
  ): Promise<number> {
    if (this.isProcessing) {
      console.warn('[BackgroundHash] Hash generation already in progress');
      return 0;
    }

    this.isProcessing = true;
    this.shouldStop = false;
    this.progressCallback = onProgress || null;

    let totalHashed = 0;

    try {
      // Get all photos without MD5 hashes
      const photosWithoutHashes = await this.getPhotosWithoutHashes();

      if (photosWithoutHashes.length === 0) {
        console.log('[BackgroundHash] No photos need hashing');
        this.notifyProgress(0, 0, 100, 'All photos already hashed');
        return 0;
      }

      const total = photosWithoutHashes.length;
      console.log(`[BackgroundHash] Starting hash generation for ${total} photos`);

      // Process in batches
      for (let i = 0; i < photosWithoutHashes.length; i += batchSize) {
        if (this.shouldStop) {
          console.log('[BackgroundHash] Hash generation stopped');
          break;
        }

        const batch = photosWithoutHashes.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(total / batchSize);

        this.notifyProgress(
          i,
          total,
          Math.round((i / total) * 100),
          `Hashing batch ${batchNumber}/${totalBatches}...`
        );

        // Process batch
        const hashCount = await this.processBatch(batch);
        totalHashed += hashCount;

        // Small delay to avoid blocking UI
        await this.delay(10);
      }

      this.notifyProgress(
        total,
        total,
        100,
        `Hashing complete! Generated ${totalHashed} hashes`
      );

      console.log(`[BackgroundHash] Generated ${totalHashed} hashes`);
      return totalHashed;

    } catch (error) {
      console.error('[BackgroundHash] Error during hash generation:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.progressCallback = null;
    }
  }

  /**
   * Stop ongoing hash generation
   */
  stop(): void {
    if (this.isProcessing) {
      this.shouldStop = true;
    }
  }

  /**
   * Check if hash generation is in progress
   */
  isRunning(): boolean {
    return this.isProcessing;
  }

  /**
   * Get count of photos without hashes
   *
   * @returns Promise<number>
   */
  async getPhotosWithoutHashesCount(): Promise<number> {
    try {
      const result = await executeQuery<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM photos
         WHERE is_deleted = 0
         AND id NOT IN (SELECT photo_id FROM photo_hashes WHERE md5_hash IS NOT NULL)`
      );

      return result[0]?.count || 0;
    } catch (error) {
      console.error('[BackgroundHash] Error getting photos without hashes count:', error);
      return 0;
    }
  }

  /**
   * Get photos that need hashes
   *
   * @returns Promise<Array<{id: string, uri: string}>>
   */
  private async getPhotosWithoutHashes(): Promise<Array<{ id: string; uri: string }>> {
    try {
      const photos = await executeQuery<{ id: string; uri: string }>(
        `SELECT id, uri
         FROM photos
         WHERE is_deleted = 0
         AND id NOT IN (SELECT photo_id FROM photo_hashes WHERE md5_hash IS NOT NULL)
         ORDER BY creation_time DESC`
      );

      return photos;
    } catch (error) {
      console.error('[BackgroundHash] Error getting photos without hashes:', error);
      return [];
    }
  }

  /**
   * Process a batch of photos and generate hashes
   *
   * @param batch Array of photo IDs and URIs
   * @returns Promise<number> Number of hashes generated
   */
  private async processBatch(batch: Array<{ id: string; uri: string }>): Promise<number> {
    let hashCount = 0;

    for (const photo of batch) {
      if (this.shouldStop) {
        break;
      }

      try {
        // Generate MD5 hash
        const hash = await this.generateMD5(photo.uri);

        // Check if hash record exists
        const existingHash = await executeQuery(
          'SELECT photo_id FROM photo_hashes WHERE photo_id = ?',
          [photo.id]
        );

        if (existingHash.length > 0) {
          // Update existing record
          await updateHash(photo.id, 'md5_hash', hash);
        } else {
          // Insert new hash record
          await insertHash({
            photo_id: photo.id,
            md5_hash: hash,
            perceptual_hash: undefined,
            dhash: undefined,
            average_hash: undefined,
          });
        }

        hashCount++;
      } catch (error) {
        console.error(`[BackgroundHash] Error hashing photo ${photo.id}:`, error);
        // Continue with next photo
      }
    }

    return hashCount;
  }

  /**
   * Generate MD5 hash for a photo
   *
   * @param uri Photo URI
   * @returns Promise<string> MD5 hash
   */
  private async generateMD5(uri: string): Promise<string> {
    try {
      // Read file as base64
      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Generate MD5 hash
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        fileContent
      );

      return hash;
    } catch (error) {
      console.error('[BackgroundHash] Error generating MD5:', error);
      throw error;
    }
  }

  /**
   * Notify progress to callback
   */
  private notifyProgress(current: number, total: number, percentage: number, message: string): void {
    if (this.progressCallback) {
      this.progressCallback({
        current,
        total,
        percentage,
        message,
      });
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const backgroundHashService = new BackgroundHashService();
