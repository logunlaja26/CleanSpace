/**
 * DuplicateDetector Service
 *
 * Detects duplicate photos using multiple algorithms.
 *
 * Based on CLAUDE.md requirements:
 * - Exact: Same MD5 (confidence 1.0)
 * - Visual similarity: Perceptual hash + Hamming distance (0-5 = very similar, confidence 0.92)
 * - Burst: Photos within 2 seconds + same location (confidence 0.95)
 * - Screenshot groups: Date-based clustering (confidence 0.85)
 *
 * Detection Workflow:
 * 1. Run all detection algorithms
 * 2. Create duplicate groups with confidence scores
 * 3. Rank photos within each group
 * 4. Calculate potential savings
 */

import {
  DuplicateGroupType,
  createDuplicateGroup,
  addPhotosToGroup,
  updateGroupStatistics,
  getDuplicateStatistics,
  getAllDuplicateGroupsWithPhotos,
} from '../database/queries/duplicates';
import {
  getExactDuplicateGroups,
  getAllPerceptualHashes,
} from '../database/queries/hashes';
import { getAllPhotos, Photo } from '../database/queries/photos';
import { hashGenerator } from './HashGenerator';

/**
 * Detection result
 */
export interface DetectionResult {
  groupsCreated: number;
  exactDuplicates: number;
  similarPhotos: number;
  burstGroups: number;
  screenshotGroups: number;
  totalSavings: number;
  duration: number;
}

/**
 * Detection progress callback
 */
export type DetectionProgressCallback = (progress: {
  current: number;
  total: number;
  percentage: number;
  stage: string;
  message?: string;
}) => void;

/**
 * DuplicateDetector class
 *
 * Analyzes photos and creates duplicate groups using multiple algorithms.
 */
export class DuplicateDetector {
  private isDetecting: boolean = false;
  private shouldCancel: boolean = false;

  /**
   * Detect all types of duplicates
   *
   * Runs all detection algorithms and creates duplicate groups.
   *
   * @param onProgress Optional progress callback
   * @returns Promise<DetectionResult>
   * @example
   * const detector = new DuplicateDetector();
   * const result = await detector.detectAllDuplicates((progress) => {
   *   console.log(`${progress.stage}: ${progress.percentage}%`);
   * });
   */
  async detectAllDuplicates(
    onProgress?: DetectionProgressCallback
  ): Promise<DetectionResult> {
    if (this.isDetecting) {
      throw new Error('Detection already in progress');
    }

    this.isDetecting = true;
    this.shouldCancel = false;

    const startTime = Date.now();
    let groupsCreated = 0;
    let exactDuplicates = 0;
    let similarPhotos = 0;
    let burstGroups = 0;
    let screenshotGroups = 0;

    try {
      // Stage 1: Detect exact duplicates (MD5)
      onProgress?.({
        current: 1,
        total: 4,
        percentage: 25,
        stage: 'Exact Duplicates',
        message: 'Finding exact duplicates...',
      });

      exactDuplicates = await this.detectExactDuplicates();
      groupsCreated += exactDuplicates;

      if (this.shouldCancel) throw new Error('Detection cancelled');

      // Stage 2: Detect visually similar photos
      onProgress?.({
        current: 2,
        total: 4,
        percentage: 50,
        stage: 'Visual Similarity',
        message: 'Finding visually similar photos...',
      });

      similarPhotos = await this.detectVisualSimilarity();
      groupsCreated += similarPhotos;

      if (this.shouldCancel) throw new Error('Detection cancelled');

      // Stage 3: Detect burst photos
      onProgress?.({
        current: 3,
        total: 4,
        percentage: 75,
        stage: 'Burst Photos',
        message: 'Finding burst photo groups...',
      });

      burstGroups = await this.detectBurstPhotos();
      groupsCreated += burstGroups;

      if (this.shouldCancel) throw new Error('Detection cancelled');

      // Stage 4: Detect screenshot groups
      onProgress?.({
        current: 4,
        total: 4,
        percentage: 100,
        stage: 'Screenshots',
        message: 'Grouping screenshots...',
      });

      screenshotGroups = await this.detectScreenshotGroups();
      groupsCreated += screenshotGroups;

      // Get total potential savings
      const stats = await getDuplicateStatistics();

      return {
        groupsCreated,
        exactDuplicates,
        similarPhotos,
        burstGroups,
        screenshotGroups,
        totalSavings: stats.potentialSavings,
        duration: Date.now() - startTime,
      };
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Detect exact duplicates (same MD5 hash)
   *
   * Based on CLAUDE.md: "Exact: Same MD5 (confidence 1.0)"
   *
   * @returns Promise<number> Number of duplicate groups created
   */
  async detectExactDuplicates(): Promise<number> {
    const duplicateGroups = await getExactDuplicateGroups();

    let groupsCreated = 0;

    for (const [md5Hash, hashes] of duplicateGroups.entries()) {
      if (hashes.length < 2) continue; // Need at least 2 photos to be duplicates

      // Create duplicate group
      const groupId = await createDuplicateGroup({
        group_type: 'exact',
        confidence_score: 1.0, // Exact match = 100% confidence
        is_resolved: 0,
      });

      // Add all photos to group
      const photoMappings = hashes.map((hash, index) => ({
        photoId: hash.photo_id,
        isPrimary: index === 0, // First photo is primary by default
      }));

      await addPhotosToGroup(groupId, photoMappings);

      // Update group statistics (size, savings)
      await updateGroupStatistics(groupId);

      groupsCreated++;
    }

    console.log(`[DuplicateDetector] Created ${groupsCreated} exact duplicate groups`);

    return groupsCreated;
  }

  /**
   * Detect visually similar photos using perceptual hashes
   *
   * Based on CLAUDE.md: "Visual similarity: Perceptual hash + Hamming distance (0-5 = very similar)"
   *
   * @param threshold Maximum Hamming distance for similarity (default: 5)
   * @returns Promise<number> Number of similar photo groups created
   */
  async detectVisualSimilarity(threshold: number = 5): Promise<number> {
    const perceptualHashes = await getAllPerceptualHashes();

    if (perceptualHashes.length < 2) {
      return 0;
    }

    // Find similar photos by comparing perceptual hashes
    const similarGroups: Map<string, string[]> = new Map();
    const processed = new Set<string>();

    for (let i = 0; i < perceptualHashes.length; i++) {
      const hash1 = perceptualHashes[i];

      if (processed.has(hash1.photo_id)) continue;

      const similarPhotos: string[] = [hash1.photo_id];

      for (let j = i + 1; j < perceptualHashes.length; j++) {
        const hash2 = perceptualHashes[j];

        if (processed.has(hash2.photo_id)) continue;

        // Calculate Hamming distance
        const distance = hashGenerator.calculateHammingDistance(
          hash1.perceptual_hash,
          hash2.perceptual_hash
        );

        if (distance <= threshold) {
          similarPhotos.push(hash2.photo_id);
          processed.add(hash2.photo_id);
        }
      }

      if (similarPhotos.length >= 2) {
        similarGroups.set(hash1.photo_id, similarPhotos);
        processed.add(hash1.photo_id);
      }
    }

    let groupsCreated = 0;

    for (const [_, photoIds] of similarGroups.entries()) {
      // Calculate confidence based on Hamming distance
      // Lower distance = higher confidence
      const confidence = 0.92; // Default confidence for similar photos

      // Create duplicate group
      const groupId = await createDuplicateGroup({
        group_type: 'similar',
        confidence_score: confidence,
        is_resolved: 0,
      });

      // Add photos to group
      const photoMappings = photoIds.map((photoId, index) => ({
        photoId,
        isPrimary: index === 0,
      }));

      await addPhotosToGroup(groupId, photoMappings);

      // Update statistics
      await updateGroupStatistics(groupId);

      groupsCreated++;
    }

    console.log(`[DuplicateDetector] Created ${groupsCreated} visually similar groups`);

    return groupsCreated;
  }

  /**
   * Detect burst photos (photos taken within 2 seconds at same location)
   *
   * Based on CLAUDE.md: "Burst: Photos within 2 seconds + same location (confidence 0.95)"
   *
   * @returns Promise<number> Number of burst groups created
   */
  async detectBurstPhotos(): Promise<number> {
    const allPhotos = await getAllPhotos({ limit: 10000 });

    // Sort by creation time
    const sortedPhotos = allPhotos.sort((a, b) =>
      (a.creation_time || 0) - (b.creation_time || 0)
    );

    const burstGroups: Photo[][] = [];
    let currentBurst: Photo[] = [];

    for (let i = 0; i < sortedPhotos.length; i++) {
      const photo = sortedPhotos[i];

      if (currentBurst.length === 0) {
        currentBurst.push(photo);
        continue;
      }

      const lastPhoto = currentBurst[currentBurst.length - 1];

      // Check if within 2 seconds
      const timeDiff = Math.abs((photo.creation_time || 0) - (lastPhoto.creation_time || 0));
      const withinTimeWindow = timeDiff <= 2;

      // Check if same location (if location data available)
      let sameLocation = true;
      if (photo.location_latitude && photo.location_longitude &&
          lastPhoto.location_latitude && lastPhoto.location_longitude) {
        const latDiff = Math.abs(photo.location_latitude - lastPhoto.location_latitude);
        const lonDiff = Math.abs(photo.location_longitude - lastPhoto.location_longitude);
        sameLocation = latDiff < 0.0001 && lonDiff < 0.0001; // ~10 meters
      }

      if (withinTimeWindow && sameLocation) {
        currentBurst.push(photo);
      } else {
        // Save current burst if it has 2+ photos
        if (currentBurst.length >= 2) {
          burstGroups.push([...currentBurst]);
        }
        currentBurst = [photo];
      }
    }

    // Don't forget last burst
    if (currentBurst.length >= 2) {
      burstGroups.push(currentBurst);
    }

    let groupsCreated = 0;

    for (const burst of burstGroups) {
      // Create burst group
      const groupId = await createDuplicateGroup({
        group_type: 'burst',
        confidence_score: 0.95,
        is_resolved: 0,
      });

      // Add photos to group
      const photoMappings = burst.map((photo, index) => ({
        photoId: photo.id,
        isPrimary: index === 0,
      }));

      await addPhotosToGroup(groupId, photoMappings);
      await updateGroupStatistics(groupId);

      groupsCreated++;
    }

    console.log(`[DuplicateDetector] Created ${groupsCreated} burst photo groups`);

    return groupsCreated;
  }

  /**
   * Detect screenshot groups (screenshots grouped by date)
   *
   * Based on CLAUDE.md: "Screenshot groups: Date-based clustering (confidence 0.85)"
   *
   * @returns Promise<number> Number of screenshot groups created
   */
  async detectScreenshotGroups(): Promise<number> {
    const allPhotos = await getAllPhotos({ limit: 10000 });

    // Filter screenshots only
    const screenshots = allPhotos.filter(p => p.is_screenshot === 1);

    if (screenshots.length < 2) {
      return 0;
    }

    // Group by date
    const groupsByDate: Map<string, Photo[]> = new Map();

    for (const screenshot of screenshots) {
      const creationTime = screenshot.creation_time || 0;
      const date = new Date(creationTime * 1000);
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

      if (!groupsByDate.has(dateKey)) {
        groupsByDate.set(dateKey, []);
      }

      groupsByDate.get(dateKey)!.push(screenshot);
    }

    let groupsCreated = 0;

    // Create groups for dates with 3+ screenshots
    for (const [dateKey, photos] of groupsByDate.entries()) {
      if (photos.length < 3) continue; // Need at least 3 screenshots to group

      // Create screenshot group
      const groupId = await createDuplicateGroup({
        group_type: 'screenshot',
        confidence_score: 0.85,
        is_resolved: 0,
      });

      // Add screenshots to group
      const photoMappings = photos.map((photo, index) => ({
        photoId: photo.id,
        isPrimary: index === 0,
      }));

      await addPhotosToGroup(groupId, photoMappings);
      await updateGroupStatistics(groupId);

      groupsCreated++;
    }

    console.log(`[DuplicateDetector] Created ${groupsCreated} screenshot groups`);

    return groupsCreated;
  }

  /**
   * Rank photos within a duplicate group
   *
   * Determines the best photo to keep based on quality metrics.
   * For Pro users, this can use AI quality scoring.
   *
   * @param groupId Group ID
   * @returns Promise<string> Photo ID of best photo
   */
  async rankPhotosInGroup(groupId: number): Promise<string> {
    // This is a simplified implementation
    // For Pro tier, integrate with AIQualityScorer service

    const groups = await getAllDuplicateGroupsWithPhotos(true);
    const group = groups.find(g => g.id === groupId);

    if (!group || group.photos.length === 0) {
      throw new Error('Group not found or empty');
    }

    // Simple ranking: largest file size = best quality
    const bestPhoto = group.photos.reduce((best, current) => {
      const bestSize = best.file_size || 0;
      const currentSize = current.file_size || 0;
      return currentSize > bestSize ? current : best;
    });

    return bestPhoto.photo_id;
  }

  /**
   * Calculate Hamming distance between two hashes
   *
   * @param hash1 First hash
   * @param hash2 Second hash
   * @returns number Hamming distance
   */
  calculateHammingDistance(hash1: string, hash2: string): number {
    return hashGenerator.calculateHammingDistance(hash1, hash2);
  }

  /**
   * Cancel ongoing detection
   */
  cancelDetection(): void {
    if (this.isDetecting) {
      this.shouldCancel = true;
    }
  }

  /**
   * Check if detection is in progress
   *
   * @returns boolean
   */
  isDetectionInProgress(): boolean {
    return this.isDetecting;
  }

  /**
   * Get detection statistics
   *
   * @returns Promise with statistics
   */
  async getStatistics() {
    return await getDuplicateStatistics();
  }
}

// Export singleton instance
export const duplicateDetector = new DuplicateDetector();
