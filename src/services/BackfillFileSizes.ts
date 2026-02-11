/**
 * Backfill File Sizes Service
 *
 * Updates existing photos and videos in the database that have file_size = 0
 * by retrieving the actual file size from the device using FileSystem.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as PhotoQueries from '../database/queries/photos';
import * as VideoQueries from '../database/queries/videos';

export interface BackfillResult {
  photosUpdated: number;
  videosUpdated: number;
  photosFailed: number;
  videosFailed: number;
  totalSize: number;
}

/**
 * Backfill file sizes for all photos and videos with file_size = 0
 */
export async function backfillFileSizes(
  onProgress?: (current: number, total: number) => void
): Promise<BackfillResult> {
  console.log('[BackfillFileSizes] Starting backfill process...');

  const result: BackfillResult = {
    photosUpdated: 0,
    videosUpdated: 0,
    photosFailed: 0,
    videosFailed: 0,
    totalSize: 0,
  };

  try {
    // Get all photos with file_size = 0
    const photos = await PhotoQueries.getAllPhotos({ limit: 10000, offset: 0 });
    const photosToUpdate = photos.filter(p => p.file_size === 0);

    console.log(`[BackfillFileSizes] Found ${photosToUpdate.length} photos with file_size = 0`);

    // Update photos
    for (let i = 0; i < photosToUpdate.length; i++) {
      const photo = photosToUpdate[i];

      try {
        const fileInfo = await FileSystem.getInfoAsync(photo.uri);

        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
          // Update photo in database
          await PhotoQueries.updatePhoto(photo.id, { file_size: fileInfo.size });
          result.photosUpdated++;
          result.totalSize += fileInfo.size;

          console.log(`[BackfillFileSizes] Updated photo ${photo.id}: ${fileInfo.size} bytes`);
        } else {
          console.warn(`[BackfillFileSizes] Could not get size for photo ${photo.id}`);
          result.photosFailed++;
        }
      } catch (error) {
        console.error(`[BackfillFileSizes] Error updating photo ${photo.id}:`, error);
        result.photosFailed++;
      }

      // Report progress
      if (onProgress) {
        onProgress(i + 1, photosToUpdate.length);
      }
    }

    // Get all videos with file_size = 0
    const videos = await VideoQueries.getAllVideos({ limit: 10000, offset: 0 });
    const videosToUpdate = videos.filter(v => v.file_size === 0);

    console.log(`[BackfillFileSizes] Found ${videosToUpdate.length} videos with file_size = 0`);

    // Update videos
    for (let i = 0; i < videosToUpdate.length; i++) {
      const video = videosToUpdate[i];

      try {
        const fileInfo = await FileSystem.getInfoAsync(video.uri);

        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
          // Update video in database
          await VideoQueries.updateVideo(video.id, { file_size: fileInfo.size });
          result.videosUpdated++;
          result.totalSize += fileInfo.size;

          console.log(`[BackfillFileSizes] Updated video ${video.id}: ${fileInfo.size} bytes`);
        } else {
          console.warn(`[BackfillFileSizes] Could not get size for video ${video.id}`);
          result.videosFailed++;
        }
      } catch (error) {
        console.error(`[BackfillFileSizes] Error updating video ${video.id}:`, error);
        result.videosFailed++;
      }

      // Report progress
      if (onProgress) {
        onProgress(photosToUpdate.length + i + 1, photosToUpdate.length + videosToUpdate.length);
      }
    }

    console.log('[BackfillFileSizes] Backfill complete:', result);
    return result;

  } catch (error) {
    console.error('[BackfillFileSizes] Fatal error during backfill:', error);
    throw error;
  }
}
