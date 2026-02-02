/**
 * StorageAnalytics Service
 *
 * Calculates and tracks storage usage, savings, and trends.
 *
 * Based on CLAUDE.md requirements:
 * - Calculate total storage used by photos/videos
 * - Get storage breakdown (photos vs videos vs screenshots)
 * - Estimate potential space recovery from duplicates
 * - Track successful cleanups and savings
 * - Provide historical data for charts
 * - Take periodic snapshots for analytics
 *
 * Key Metrics:
 * - Total storage used
 * - Storage by category (photos, videos, screenshots)
 * - Potential savings (from duplicate groups)
 * - Actual savings (from completed cleanups)
 * - Storage trends over time
 */

import { getTotalPhotoSize, getPhotoCount } from '../database/queries/photos';
import { getTotalVideosSize, getVideoCount } from '../database/queries/videos';
import { getTotalPotentialSavings, getDuplicateStatistics } from '../database/queries/duplicates';
import { executeQuery, executeQueryFirst, executeNonQuery } from '../database/init';

/**
 * Storage breakdown by category
 */
export interface StorageBreakdown {
  totalSize: number;
  photosSize: number;
  videosSize: number;
  screenshotsSize: number;
  photoCount: number;
  videoCount: number;
  screenshotCount: number;
}

/**
 * Storage summary for dashboard
 */
export interface StorageSummary {
  totalSize: number;
  totalPhotos: number;
  breakdown: StorageBreakdown;
  potentialSavings: number;
  actualSavings: number;
  duplicateGroups: number;
  lastScanDate?: Date;
}

/**
 * Storage trend data point
 */
export interface StorageTrendPoint {
  date: Date;
  totalSize: number;
  photoCount: number;
  savings: number;
}

/**
 * Storage snapshot (for historical tracking)
 */
interface StorageSnapshot {
  id?: number;
  total_size: number;
  photo_count: number;
  video_count: number;
  duplicate_groups: number;
  potential_savings: number;
  actual_savings: number;
  snapshot_date: number;
}

/**
 * StorageAnalytics class
 *
 * Provides storage metrics and analytics for the app.
 */
export class StorageAnalytics {
  /**
   * Calculate total storage used
   *
   * Sums all photo and video file sizes.
   *
   * @returns Promise<number> Total size in bytes
   * @example
   * const totalSize = await storageAnalytics.calculateTotalStorage();
   * console.log(`Using ${formatBytes(totalSize)} of storage`);
   */
  async calculateTotalStorage(): Promise<number> {
    const photoSize = await getTotalPhotoSize(false); // Exclude deleted photos
    const videoSize = await getTotalVideosSize(); // Get videos size
    return photoSize + videoSize;
  }

  /**
   * Get storage breakdown by category
   *
   * @returns Promise<StorageBreakdown>
   * @example
   * const breakdown = await storageAnalytics.getStorageBreakdown();
   * console.log(`Photos: ${breakdown.photosSize} bytes`);
   * console.log(`Videos: ${breakdown.videosSize} bytes`);
   */
  async getStorageBreakdown(): Promise<StorageBreakdown> {
    // Get total stats
    const totalSize = await getTotalPhotoSize(false);
    const totalCount = await getPhotoCount(false);

    // Get photos (non-screenshot images)
    const photosResult = await executeQueryFirst<{ size: number; count: number }>(
      `SELECT COALESCE(SUM(file_size), 0) as size, COUNT(*) as count
       FROM photos
       WHERE is_deleted = 0
         AND media_type = 'photo'
         AND is_screenshot = 0;`,
      []
    );

    // Get videos from videos table
    const videosSize = await getTotalVideosSize();
    const videosCount = await getVideoCount();

    // Get screenshots
    const screenshotsResult = await executeQueryFirst<{ size: number; count: number }>(
      `SELECT COALESCE(SUM(file_size), 0) as size, COUNT(*) as count
       FROM photos
       WHERE is_deleted = 0
         AND is_screenshot = 1;`,
      []
    );

    return {
      totalSize,
      photosSize: photosResult?.size || 0,
      videosSize: videosSize,
      screenshotsSize: screenshotsResult?.size || 0,
      photoCount: photosResult?.count || 0,
      videoCount: videosCount,
      screenshotCount: screenshotsResult?.count || 0,
    };
  }

  /**
   * Estimate potential savings
   *
   * Calculates how much space could be saved by cleaning up duplicates.
   *
   * @returns Promise<number> Potential savings in bytes
   * @example
   * const savings = await storageAnalytics.estimateSavings();
   * console.log(`You could free up ${formatBytes(savings)}`);
   */
  async estimateSavings(): Promise<number> {
    return await getTotalPotentialSavings();
  }

  /**
   * Track actual savings from cleanup
   *
   * Records how much space was actually freed by deleting photos.
   *
   * @param amount Amount saved in bytes
   * @returns Promise<void>
   * @example
   * // After deleting duplicates
   * await storageAnalytics.trackSavings(2500000); // 2.5 MB saved
   */
  async trackSavings(amount: number): Promise<void> {
    // Update storage_analytics table
    await executeNonQuery(
      `INSERT INTO storage_analytics (metric_name, metric_value, recorded_at)
       VALUES ('total_savings', ?, strftime('%s', 'now'));`,
      [amount]
    );

    console.log(`[StorageAnalytics] Tracked ${amount} bytes saved`);
  }

  /**
   * Get total actual savings (all time)
   *
   * @returns Promise<number> Total savings in bytes
   */
  async getTotalSavings(): Promise<number> {
    const result = await executeQueryFirst<{ total: number }>(
      `SELECT COALESCE(SUM(metric_value), 0) as total
       FROM storage_analytics
       WHERE metric_name = 'total_savings';`,
      []
    );

    return result?.total || 0;
  }

  /**
   * Get storage trends
   *
   * Returns historical storage data for charts.
   *
   * @param days Number of days of history to return
   * @returns Promise<StorageTrendPoint[]>
   * @example
   * const trends = await storageAnalytics.getStorageTrends(30);
   * // Plot trends on a chart
   */
  async getStorageTrends(days: number = 30): Promise<StorageTrendPoint[]> {
    const cutoffDate = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const snapshots = await executeQuery<StorageSnapshot>(
      `SELECT * FROM storage_analytics
       WHERE metric_name = 'storage_snapshot'
         AND recorded_at >= ?
       ORDER BY recorded_at ASC;`,
      [cutoffDate]
    );

    // Convert to trend points
    return snapshots.map(snapshot => ({
      date: new Date(snapshot.snapshot_date * 1000),
      totalSize: snapshot.total_size,
      photoCount: snapshot.photo_count,
      savings: snapshot.actual_savings,
    }));
  }

  /**
   * Take storage snapshot
   *
   * Records current storage state for historical tracking.
   *
   * @returns Promise<void>
   * @example
   * // Take a snapshot daily
   * await storageAnalytics.takeStorageSnapshot();
   */
  async takeStorageSnapshot(): Promise<void> {
    const totalSize = await this.calculateTotalStorage();
    const photoCount = await getPhotoCount(false);
    const duplicateStats = await getDuplicateStatistics();
    const totalSavings = await this.getTotalSavings();

    // Get video count from videos table
    const videoCountResult = await getVideoCount();

    const snapshot: Omit<StorageSnapshot, 'id'> = {
      total_size: totalSize,
      photo_count: photoCount,
      video_count: videoCountResult,
      duplicate_groups: duplicateStats.unresolvedGroups,
      potential_savings: duplicateStats.potentialSavings,
      actual_savings: totalSavings,
      snapshot_date: Math.floor(Date.now() / 1000),
    };

    await executeNonQuery(
      `INSERT INTO storage_analytics (
        metric_name, metric_value, recorded_at, metadata
      ) VALUES (
        'storage_snapshot',
        ?,
        strftime('%s', 'now'),
        ?
      );`,
      [snapshot.total_size, JSON.stringify(snapshot)]
    );

    console.log('[StorageAnalytics] Snapshot taken');
  }

  /**
   * Get complete storage summary for dashboard
   *
   * @returns Promise<StorageSummary>
   * @example
   * const summary = await storageAnalytics.getStorageSummary();
   * return (
   *   <Dashboard
   *     totalSize={summary.totalSize}
   *     potentialSavings={summary.potentialSavings}
   *   />
   * );
   */
  async getStorageSummary(): Promise<StorageSummary> {
    const [breakdown, potentialSavings, actualSavings, duplicateStats, lastScan] = await Promise.all([
      this.getStorageBreakdown(),
      this.estimateSavings(),
      this.getTotalSavings(),
      getDuplicateStatistics(),
      this.getLastScanDate(),
    ]);

    return {
      totalSize: breakdown.totalSize,
      totalPhotos: breakdown.photoCount + breakdown.videoCount + breakdown.screenshotCount,
      breakdown,
      potentialSavings,
      actualSavings,
      duplicateGroups: duplicateStats.unresolvedGroups,
      lastScanDate: lastScan,
    };
  }

  /**
   * Get last scan date
   *
   * @returns Promise<Date | undefined>
   */
  async getLastScanDate(): Promise<Date | undefined> {
    const result = await executeQueryFirst<{ scan_date: number }>(
      `SELECT MAX(scan_date) as scan_date FROM scan_history;`,
      []
    );

    return result?.scan_date ? new Date(result.scan_date * 1000) : undefined;
  }

  /**
   * Format bytes to human-readable string
   *
   * @param bytes Number of bytes
   * @param decimals Number of decimal places
   * @returns string Formatted string (e.g., "1.5 GB")
   * @example
   * const formatted = storageAnalytics.formatBytes(1500000000);
   * console.log(formatted); // "1.40 GB"
   */
  formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Calculate storage percentage used
   *
   * This is a placeholder. In production, you'd get device total storage from native module.
   *
   * @param usedBytes Bytes used
   * @param totalBytes Total device storage
   * @returns number Percentage (0-100)
   */
  calculateStoragePercentage(usedBytes: number, totalBytes: number): number {
    if (totalBytes === 0) return 0;
    return Math.round((usedBytes / totalBytes) * 100);
  }

  /**
   * Get storage statistics for analytics export
   *
   * @returns Promise with statistics
   */
  async getAnalyticsExport(): Promise<{
    totalSize: number;
    totalPhotos: number;
    totalVideos: number;
    duplicateGroups: number;
    potentialSavings: number;
    actualSavings: number;
    timestamp: number;
  }> {
    const breakdown = await this.getStorageBreakdown();
    const potentialSavings = await this.estimateSavings();
    const actualSavings = await this.getTotalSavings();
    const duplicateStats = await getDuplicateStatistics();

    return {
      totalSize: breakdown.totalSize,
      totalPhotos: breakdown.photoCount,
      totalVideos: breakdown.videoCount,
      duplicateGroups: duplicateStats.unresolvedGroups,
      potentialSavings,
      actualSavings,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }
}

// Export singleton instance
export const storageAnalytics = new StorageAnalytics();
