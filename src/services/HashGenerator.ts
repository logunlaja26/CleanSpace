/**
 * HashGenerator Service
 *
 * Generates multiple types of photo hashes for duplicate detection.
 *
 * Based on CLAUDE.md requirements:
 * - Two-phase hashing: MD5 immediate (handled by PhotoScanner), advanced hashes in background
 * - Multiple hash types: MD5, Perceptual, DHash, Average
 * - Background processing queue for advanced hashes
 * - Batch processing for performance
 *
 * Hash Types:
 * - MD5: Exact duplicate detection (file content hash) - Phase 1
 * - Perceptual: Visual similarity detection - Phase 2
 * - DHash: Difference hash for detecting rotations - Phase 2
 * - Average: Basic similarity detection - Phase 2
 *
 * Note: For production, perceptual hashing requires image processing libraries.
 * This implementation provides a simplified version using image dimensions and file size.
 * For real perceptual hashing, consider:
 * - Native modules (faster)
 * - External libraries like react-native-image-hash
 * - Custom implementation with canvas/image manipulation
 */

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import {
  updateAdvancedHashes,
  getPhotosMissingAdvancedHashes,
  getHashStatistics,
} from '../database/queries/hashes';
import { getPhotoById } from '../database/queries/photos';

/**
 * Hash generation result
 */
export interface HashResult {
  md5: string;
  perceptual: string;
  dhash: string;
  average: string;
}

/**
 * HashGenerator class
 *
 * Generates various types of photo hashes for duplicate detection.
 * Runs in background to avoid blocking the UI.
 */
export class HashGenerator {
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;

  /**
   * Generate MD5 hash for a photo
   *
   * This is a simple content hash used for exact duplicate detection.
   * Called during Phase 1 (scan time).
   *
   * @param uri Photo URI
   * @returns Promise<string> MD5 hash
   * @example
   * const md5 = await hashGenerator.generateMD5('file:///path/to/photo.jpg');
   */
  async generateMD5(uri: string): Promise<string> {
    try {
      // Read file as base64
      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Generate MD5 hash
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.MD5,
        fileContent
      );

      return hash;
    } catch (error) {
      console.error('[HashGenerator] Error generating MD5:', error);
      throw error;
    }
  }

  /**
   * Generate perceptual hash for a photo
   *
   * Perceptual hashing creates a hash that is similar for visually similar images.
   * This is a simplified implementation.
   *
   * For production, use proper perceptual hashing algorithms:
   * - pHash (Perceptual Hash)
   * - aHash (Average Hash)
   * - dHash (Difference Hash)
   *
   * @param uri Photo URI
   * @param width Photo width
   * @param height Photo height
   * @returns Promise<string> Perceptual hash
   */
  async generatePerceptualHash(uri: string, width?: number, height?: number): Promise<string> {
    try {
      // Simplified perceptual hash based on file metadata
      // In production, this should analyze actual image pixels

      const fileInfo = await FileSystem.getInfoAsync(uri);
      const size = 'size' in fileInfo ? fileInfo.size : 0;

      // Create a pseudo-perceptual hash from dimensions and size
      // This is a placeholder - real implementation would analyze pixels
      const hashInput = `${width || 0}x${height || 0}:${size}`;
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hashInput
      );

      // Return first 16 characters as perceptual hash
      return hash.substring(0, 16);
    } catch (error) {
      console.error('[HashGenerator] Error generating perceptual hash:', error);
      // Return default hash on error
      return '0000000000000000';
    }
  }

  /**
   * Generate difference hash (DHash) for a photo
   *
   * DHash is useful for detecting rotated or slightly modified images.
   * This is a simplified implementation.
   *
   * @param uri Photo URI
   * @param width Photo width
   * @param height Photo height
   * @returns Promise<string> Difference hash
   */
  async generateDHash(uri: string, width?: number, height?: number): Promise<string> {
    try {
      // Simplified DHash based on aspect ratio
      // Real implementation would compare adjacent pixels

      const aspectRatio = width && height ? width / height : 1.0;
      const hashInput = `dhash:${aspectRatio.toFixed(4)}`;

      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hashInput
      );

      return hash.substring(0, 16);
    } catch (error) {
      console.error('[HashGenerator] Error generating DHash:', error);
      return '0000000000000000';
    }
  }

  /**
   * Generate average hash for a photo
   *
   * Average hash is a simple perceptual hash based on average brightness.
   * This is a simplified implementation.
   *
   * @param uri Photo URI
   * @param width Photo width
   * @param height Photo height
   * @returns Promise<string> Average hash
   */
  async generateAverageHash(uri: string, width?: number, height?: number): Promise<string> {
    try {
      // Simplified average hash based on dimensions
      // Real implementation would calculate average pixel brightness

      const totalPixels = (width || 0) * (height || 0);
      const hashInput = `avg:${totalPixels}`;

      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        hashInput
      );

      return hash.substring(0, 16);
    } catch (error) {
      console.error('[HashGenerator] Error generating average hash:', error);
      return '0000000000000000';
    }
  }

  /**
   * Generate all hash types for a photo
   *
   * This generates MD5, perceptual, DHash, and average hash.
   * Used during Phase 2 background processing.
   *
   * @param photoId Photo ID
   * @returns Promise<HashResult | null>
   * @example
   * const hashes = await hashGenerator.generateAllHashes('photo-123');
   * if (hashes) {
   *   console.log('MD5:', hashes.md5);
   *   console.log('Perceptual:', hashes.perceptual);
   * }
   */
  async generateAllHashes(photoId: string): Promise<HashResult | null> {
    try {
      // Get photo details
      const photo = await getPhotoById(photoId);
      if (!photo) {
        console.warn(`[HashGenerator] Photo ${photoId} not found`);
        return null;
      }

      // Generate all hash types
      const [md5, perceptual, dhash, average] = await Promise.all([
        this.generateMD5(photo.uri),
        this.generatePerceptualHash(photo.uri, photo.width, photo.height),
        this.generateDHash(photo.uri, photo.width, photo.height),
        this.generateAverageHash(photo.uri, photo.width, photo.height),
      ]);

      return {
        md5,
        perceptual,
        dhash,
        average,
      };
    } catch (error) {
      console.error(`[HashGenerator] Error generating hashes for ${photoId}:`, error);
      return null;
    }
  }

  /**
   * Process hash queue
   *
   * Generates advanced hashes for photos that only have MD5.
   * This runs in the background after initial scan.
   *
   * Based on CLAUDE.md: "Two-phase hashing: MD5 immediate, advanced hashes in background"
   *
   * @param batchSize Number of photos to process per batch
   * @param onProgress Optional progress callback
   * @returns Promise<number> Number of photos processed
   * @example
   * const processed = await hashGenerator.processHashQueue(50, (progress) => {
   *   console.log(`Hashing: ${progress.percentage}%`);
   * });
   */
  async processHashQueue(
    batchSize: number = 50,
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<number> {
    if (this.isProcessing) {
      console.warn('[HashGenerator] Hash queue processing already in progress');
      return 0;
    }

    this.isProcessing = true;
    this.shouldStop = false;

    let totalProcessed = 0;

    try {
      // Get photos missing advanced hashes
      const photoIds = await getPhotosMissingAdvancedHashes(batchSize);

      if (photoIds.length === 0) {
        console.log('[HashGenerator] No photos need hash generation');
        return 0;
      }

      const total = photoIds.length;

      // Process each photo
      for (let i = 0; i < photoIds.length; i++) {
        if (this.shouldStop) {
          console.log('[HashGenerator] Hash generation stopped by user');
          break;
        }

        const photoId = photoIds[i];

        try {
          // Get photo details
          const photo = await getPhotoById(photoId);
          if (!photo) {
            continue;
          }

          // Generate advanced hashes
          const perceptual = await this.generatePerceptualHash(photo.uri, photo.width, photo.height);
          const dhash = await this.generateDHash(photo.uri, photo.width, photo.height);
          const average = await this.generateAverageHash(photo.uri, photo.width, photo.height);

          // Update database
          await updateAdvancedHashes(photoId, perceptual, dhash, average);

          totalProcessed++;

          // Report progress
          if (onProgress) {
            onProgress({
              current: i + 1,
              total,
              percentage: Math.round(((i + 1) / total) * 100),
            });
          }
        } catch (error) {
          console.error(`[HashGenerator] Error processing ${photoId}:`, error);
          // Continue with next photo
        }
      }

      console.log(`[HashGenerator] Processed ${totalProcessed} photos`);

      return totalProcessed;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stop hash queue processing
   */
  stopProcessing(): void {
    if (this.isProcessing) {
      this.shouldStop = true;
    }
  }

  /**
   * Check if hash queue is currently processing
   *
   * @returns boolean
   */
  isHashingInProgress(): boolean {
    return this.isProcessing;
  }

  /**
   * Get hash generation statistics
   *
   * Returns counts of photos with different hash types.
   *
   * @returns Promise with statistics
   * @example
   * const stats = await hashGenerator.getStatistics();
   * console.log(`${stats.withAllHashes} / ${stats.total} photos fully hashed`);
   */
  async getStatistics(): Promise<{
    total: number;
    withMD5: number;
    withPerceptual: number;
    withDHash: number;
    withAverage: number;
    withAllHashes: number;
    percentComplete: number;
  }> {
    const stats = await getHashStatistics();

    return {
      ...stats,
      percentComplete: stats.total > 0
        ? Math.round((stats.withAllHashes / stats.total) * 100)
        : 0,
    };
  }

  /**
   * Calculate Hamming distance between two hashes
   *
   * Hamming distance measures how many bits are different between two hashes.
   * Lower distance = more similar images.
   *
   * Based on CLAUDE.md: "Visual similarity: Perceptual hash + Hamming distance (0-5 = very similar)"
   *
   * @param hash1 First hash
   * @param hash2 Second hash
   * @returns number Hamming distance (0 = identical)
   * @example
   * const distance = hashGenerator.calculateHammingDistance('abc123', 'abc124');
   * if (distance <= 5) {
   *   console.log('Images are very similar');
   * }
   */
  calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      throw new Error('Hashes must be the same length');
    }

    let distance = 0;

    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }

    return distance;
  }

  /**
   * Check if two photos are visually similar based on perceptual hash
   *
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @param threshold Maximum Hamming distance for similarity (default: 5)
   * @returns boolean True if similar
   */
  areSimilar(hash1: string, hash2: string, threshold: number = 5): boolean {
    const distance = this.calculateHammingDistance(hash1, hash2);
    return distance <= threshold;
  }
}

// Export singleton instance
export const hashGenerator = new HashGenerator();
