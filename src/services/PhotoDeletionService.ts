/**
 * PhotoDeletionService
 *
 * Handles deletion of photos from both the device and database.
 * This service performs:
 * 1. Actual deletion from device using expo-media-library
 * 2. Soft delete in SQLite database (is_deleted flag)
 *
 * Based on CLAUDE.md architecture:
 * - SQLite is updated first (instant feedback)
 * - Device deletion happens next
 * - Usage limits are enforced
 */

import * as MediaLibrary from 'expo-media-library';
import * as PhotoQueries from '../database/queries/photos';

export interface DeletionResult {
  success: boolean;
  deletedCount: number;
  errors: string[];
}

export class PhotoDeletionService {
  /**
   * Delete a single photo from both device and database
   *
   * @param photoId Photo ID from database
   * @returns Promise<boolean> True if successful
   */
  async deletePhoto(photoId: string): Promise<boolean> {
    try {
      // 1. Get photo details from database
      const photo = await PhotoQueries.getPhotoById(photoId);

      if (!photo) {
        console.error(`[PhotoDeletionService] Photo ${photoId} not found in database`);
        return false;
      }

      // 2. Soft delete in database first (instant, offline-capable)
      await PhotoQueries.deletePhoto(photoId);
      console.log(`[PhotoDeletionService] Soft deleted photo ${photoId} from database`);

      // 3. Delete from device (requires photo library permission)
      try {
        // expo-media-library uses the asset ID (which is our photo ID)
        await MediaLibrary.deleteAssetsAsync([photoId]);
        console.log(`[PhotoDeletionService] Deleted photo ${photoId} from device`);
      } catch (deviceError) {
        console.error(`[PhotoDeletionService] Failed to delete from device:`, deviceError);
        // Don't restore database - soft delete is still valid
        // User can manually delete or we can retry later
        throw new Error('Failed to delete photo from device. Photo marked as deleted in app.');
      }

      return true;
    } catch (error) {
      console.error(`[PhotoDeletionService] Error deleting photo ${photoId}:`, error);
      throw error;
    }
  }

  /**
   * Delete multiple photos from both device and database
   *
   * @param photoIds Array of photo IDs
   * @returns Promise<DeletionResult> Result with success/error details
   */
  async deletePhotos(photoIds: string[]): Promise<DeletionResult> {
    const errors: string[] = [];
    let deletedCount = 0;

    if (photoIds.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        errors: [],
      };
    }

    try {
      // 1. Soft delete all in database first (batch operation)
      await PhotoQueries.deletePhotos(photoIds);
      console.log(`[PhotoDeletionService] Soft deleted ${photoIds.length} photos from database`);

      // 2. Delete from device (batch operation)
      try {
        await MediaLibrary.deleteAssetsAsync(photoIds);
        deletedCount = photoIds.length;
        console.log(`[PhotoDeletionService] Deleted ${photoIds.length} photos from device`);
      } catch (deviceError) {
        console.error(`[PhotoDeletionService] Failed to delete batch from device:`, deviceError);

        // Attempt individual deletions to identify which ones failed
        for (const photoId of photoIds) {
          try {
            await MediaLibrary.deleteAssetsAsync([photoId]);
            deletedCount++;
          } catch (individualError) {
            errors.push(`Failed to delete photo ${photoId}: ${individualError}`);
          }
        }
      }

      return {
        success: errors.length === 0,
        deletedCount,
        errors,
      };
    } catch (error) {
      console.error(`[PhotoDeletionService] Error in batch deletion:`, error);
      return {
        success: false,
        deletedCount,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      };
    }
  }

  /**
   * Check if we have permission to delete photos
   *
   * @returns Promise<boolean> True if permission granted
   */
  async hasDeletePermission(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[PhotoDeletionService] Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Request permission to delete photos
   *
   * @returns Promise<boolean> True if permission granted
   */
  async requestDeletePermission(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[PhotoDeletionService] Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Restore a soft-deleted photo (undo deletion from database)
   * Note: This only works if the photo hasn't been deleted from device yet
   *
   * @param photoId Photo ID
   * @returns Promise<boolean> True if successful
   */
  async restorePhoto(photoId: string): Promise<boolean> {
    try {
      await PhotoQueries.restorePhoto(photoId);
      console.log(`[PhotoDeletionService] Restored photo ${photoId}`);
      return true;
    } catch (error) {
      console.error(`[PhotoDeletionService] Error restoring photo ${photoId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const photoDeletionService = new PhotoDeletionService();
