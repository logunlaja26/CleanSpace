/**
 * MediaDeletionService
 *
 * Unified service for deleting both photos and videos from device and database.
 * This service performs:
 * 1. Actual deletion from device using expo-media-library
 * 2. Soft delete in SQLite database (is_deleted flag)
 *
 * Based on CLAUDE.md architecture:
 * - SQLite is updated first (instant feedback)
 * - Device deletion happens next
 * - Works for both photos and videos
 */

import * as MediaLibrary from 'expo-media-library';
import * as PhotoQueries from '../database/queries/photos';
import * as VideoQueries from '../database/queries/videos';

export interface DeletionResult {
  success: boolean;
  deletedCount: number;
  errors: string[];
}

export type MediaType = 'photo' | 'video';

export class MediaDeletionService {
  /**
   * Delete multiple media items (photos or videos) from both device and database
   *
   * @param mediaIds Array of media IDs
   * @param mediaType Type of media ('photo' or 'video')
   * @returns Promise<DeletionResult> Result with success/error details
   */
  async deleteMedia(mediaIds: string[], mediaType: MediaType): Promise<DeletionResult> {
    const errors: string[] = [];
    let deletedCount = 0;

    if (mediaIds.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        errors: [],
      };
    }

    try {
      // 1. Soft delete all in database first (batch operation)
      if (mediaType === 'photo') {
        await PhotoQueries.deletePhotos(mediaIds);
        console.log(`[MediaDeletionService] Soft deleted ${mediaIds.length} photos from database`);
      } else {
        await VideoQueries.deleteVideos(mediaIds);
        console.log(`[MediaDeletionService] Soft deleted ${mediaIds.length} videos from database`);
      }

      // 2. Delete from device (batch operation)
      // expo-media-library deleteAssetsAsync works for both photos and videos
      try {
        await MediaLibrary.deleteAssetsAsync(mediaIds);
        deletedCount = mediaIds.length;
        console.log(`[MediaDeletionService] Deleted ${mediaIds.length} ${mediaType}s from device`);
      } catch (deviceError) {
        console.error(`[MediaDeletionService] Failed to delete batch from device:`, deviceError);

        // Attempt individual deletions to identify which ones failed
        for (const mediaId of mediaIds) {
          try {
            await MediaLibrary.deleteAssetsAsync([mediaId]);
            deletedCount++;
          } catch (individualError) {
            errors.push(`Failed to delete ${mediaType} ${mediaId}: ${individualError}`);
          }
        }
      }

      return {
        success: errors.length === 0,
        deletedCount,
        errors,
      };
    } catch (error) {
      console.error(`[MediaDeletionService] Error in batch deletion:`, error);
      return {
        success: false,
        deletedCount,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      };
    }
  }

  /**
   * Delete a single media item from both device and database
   *
   * @param mediaId Media ID from database
   * @param mediaType Type of media ('photo' or 'video')
   * @returns Promise<boolean> True if successful
   */
  async deleteSingleMedia(mediaId: string, mediaType: MediaType): Promise<boolean> {
    try {
      // 1. Get media details from database
      let mediaExists = false;
      if (mediaType === 'photo') {
        const photo = await PhotoQueries.getPhotoById(mediaId);
        mediaExists = !!photo;
      } else {
        const video = await VideoQueries.getVideoById(mediaId);
        mediaExists = !!video;
      }

      if (!mediaExists) {
        console.error(`[MediaDeletionService] ${mediaType} ${mediaId} not found in database`);
        return false;
      }

      // 2. Soft delete in database first (instant, offline-capable)
      if (mediaType === 'photo') {
        await PhotoQueries.deletePhoto(mediaId);
      } else {
        await VideoQueries.deleteVideo(mediaId);
      }
      console.log(`[MediaDeletionService] Soft deleted ${mediaType} ${mediaId} from database`);

      // 3. Delete from device (requires media library permission)
      try {
        await MediaLibrary.deleteAssetsAsync([mediaId]);
        console.log(`[MediaDeletionService] Deleted ${mediaType} ${mediaId} from device`);
      } catch (deviceError) {
        console.error(`[MediaDeletionService] Failed to delete from device:`, deviceError);
        // Don't restore database - soft delete is still valid
        throw new Error(`Failed to delete ${mediaType} from device. ${mediaType} marked as deleted in app.`);
      }

      return true;
    } catch (error) {
      console.error(`[MediaDeletionService] Error deleting ${mediaType} ${mediaId}:`, error);
      throw error;
    }
  }

  /**
   * Delete photos (convenience method)
   *
   * @param photoIds Array of photo IDs
   * @returns Promise<DeletionResult>
   */
  async deletePhotos(photoIds: string[]): Promise<DeletionResult> {
    return this.deleteMedia(photoIds, 'photo');
  }

  /**
   * Delete videos (convenience method)
   *
   * @param videoIds Array of video IDs
   * @returns Promise<DeletionResult>
   */
  async deleteVideos(videoIds: string[]): Promise<DeletionResult> {
    return this.deleteMedia(videoIds, 'video');
  }

  /**
   * Check if we have permission to delete media
   *
   * @returns Promise<boolean> True if permission granted
   */
  async hasDeletePermission(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[MediaDeletionService] Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Request permission to delete media
   *
   * @returns Promise<boolean> True if permission granted
   */
  async requestDeletePermission(): Promise<boolean> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('[MediaDeletionService] Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Restore a soft-deleted media item (undo deletion from database)
   * Note: This only works if the media hasn't been deleted from device yet
   * Currently only supports photos - video restore not implemented yet
   *
   * @param mediaId Media ID
   * @param mediaType Type of media ('photo' or 'video')
   * @returns Promise<boolean> True if successful
   */
  async restoreMedia(mediaId: string, mediaType: MediaType): Promise<boolean> {
    try {
      if (mediaType === 'photo') {
        await PhotoQueries.restorePhoto(mediaId);
        console.log(`[MediaDeletionService] Restored photo ${mediaId}`);
        return true;
      } else {
        // TODO: Implement VideoQueries.restoreVideo() when needed
        console.warn(`[MediaDeletionService] Video restore not implemented yet`);
        return false;
      }
    } catch (error) {
      console.error(`[MediaDeletionService] Error restoring ${mediaType} ${mediaId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const mediaDeletionService = new MediaDeletionService();
