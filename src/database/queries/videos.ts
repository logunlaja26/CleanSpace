/**
 * Videos query module
 *
 * This module contains all database operations related to videos.
 * Similar to photos module but specifically for video files.
 *
 * Based on CLAUDE.md architecture:
 * - Batch operations for bulk inserts
 * - Pagination for large video libraries
 * - Soft deletes (is_deleted flag) instead of hard deletes
 * - Indexed queries for common patterns
 */

import { executeQuery, executeQueryFirst, executeNonQuery, executeTransaction } from '../init';
import { PaginationOptions } from './photos';

/**
 * Video type definition
 */
export interface Video {
  id: string;
  uri: string;
  filename: string;
  file_size: number;
  width?: number;
  height?: number;
  duration?: number;
  creation_time?: number;
  modification_time?: number;
  is_deleted: number;
  album_id?: string;
  location_latitude?: number;
  location_longitude?: number;
  created_at?: number;
  updated_at?: number;
}

/**
 * Video filter options
 */
export interface VideoFilter {
  minSize?: number;
  maxSize?: number;
  minDuration?: number;
  maxDuration?: number;
  fromDate?: number;
  toDate?: number;
  albumId?: string;
}

/**
 * Get all videos with pagination
 *
 * @param options Pagination options
 * @returns Promise<Video[]>
 */
export const getAllVideos = async (
  options: PaginationOptions = {}
): Promise<Video[]> => {
  const { limit = 100, offset = 0 } = options;

  const videos = await executeQuery<Video>(
    `SELECT * FROM videos
     WHERE is_deleted = 0
     ORDER BY creation_time DESC
     LIMIT ? OFFSET ?;`,
    [limit, offset]
  );

  return videos;
};

/**
 * Get video by ID
 *
 * @param id Video ID
 * @returns Promise<Video | null>
 */
export const getVideoById = async (id: string): Promise<Video | null> => {
  const video = await executeQueryFirst<Video>(
    'SELECT * FROM videos WHERE id = ? AND is_deleted = 0;',
    [id]
  );

  return video;
};

/**
 * Get videos by filter
 *
 * @param filter Filter options
 * @param pagination Pagination options
 * @returns Promise<Video[]>
 */
export const getVideosByFilter = async (
  filter: VideoFilter = {},
  pagination: PaginationOptions = {}
): Promise<Video[]> => {
  const { limit = 100, offset = 0 } = pagination;
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];

  // Apply filters
  if (filter.minSize !== undefined) {
    conditions.push('file_size >= ?');
    params.push(filter.minSize);
  }

  if (filter.maxSize !== undefined) {
    conditions.push('file_size <= ?');
    params.push(filter.maxSize);
  }

  if (filter.minDuration !== undefined) {
    conditions.push('duration >= ?');
    params.push(filter.minDuration);
  }

  if (filter.maxDuration !== undefined) {
    conditions.push('duration <= ?');
    params.push(filter.maxDuration);
  }

  if (filter.fromDate !== undefined) {
    conditions.push('creation_time >= ?');
    params.push(filter.fromDate);
  }

  if (filter.toDate !== undefined) {
    conditions.push('creation_time <= ?');
    params.push(filter.toDate);
  }

  if (filter.albumId) {
    conditions.push('album_id = ?');
    params.push(filter.albumId);
  }

  // Build query
  const whereClause = conditions.join(' AND ');
  const query = `
    SELECT * FROM videos
    WHERE ${whereClause}
    ORDER BY creation_time DESC
    LIMIT ? OFFSET ?;
  `;

  params.push(limit, offset);

  const videos = await executeQuery<Video>(query, params);
  return videos;
};

/**
 * Get large videos (above specified size)
 *
 * @param minSize Minimum size in bytes (default 10MB)
 * @param limit Maximum number of results
 * @returns Promise<Video[]>
 */
export const getLargeVideos = async (
  minSize: number = 10 * 1024 * 1024,
  limit: number = 100
): Promise<Video[]> => {
  const videos = await executeQuery<Video>(
    `SELECT * FROM videos
     WHERE is_deleted = 0 AND file_size >= ?
     ORDER BY file_size DESC
     LIMIT ?;`,
    [minSize, limit]
  );

  return videos;
};

/**
 * Get videos by duration range
 *
 * @param minDuration Minimum duration in seconds
 * @param maxDuration Maximum duration in seconds
 * @param limit Maximum number of results
 * @returns Promise<Video[]>
 */
export const getVideosByDuration = async (
  minDuration: number,
  maxDuration?: number,
  limit: number = 100
): Promise<Video[]> => {
  let query = `SELECT * FROM videos WHERE is_deleted = 0 AND duration >= ?`;
  const params: any[] = [minDuration];

  if (maxDuration !== undefined) {
    query += ' AND duration <= ?';
    params.push(maxDuration);
  }

  query += ' ORDER BY duration DESC LIMIT ?;';
  params.push(limit);

  const videos = await executeQuery<Video>(query, params);
  return videos;
};

/**
 * Get total video count
 *
 * @returns Promise<number>
 */
export const getVideoCount = async (): Promise<number> => {
  const result = await executeQueryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM videos WHERE is_deleted = 0;',
    []
  );

  return result?.count || 0;
};

/**
 * Get total videos size in bytes
 *
 * @returns Promise<number>
 */
export const getTotalVideosSize = async (): Promise<number> => {
  const result = await executeQueryFirst<{ total: number }>(
    'SELECT SUM(file_size) as total FROM videos WHERE is_deleted = 0;',
    []
  );

  return result?.total || 0;
};

/**
 * Get video statistics
 *
 * @returns Promise with count, totalSize, and averageSize
 */
export const getVideoStats = async (): Promise<{
  count: number;
  totalSize: number;
  averageSize: number;
  totalDuration: number;
  averageDuration: number;
}> => {
  const result = await executeQueryFirst<{
    count: number;
    totalSize: number;
    totalDuration: number;
  }>(
    `SELECT
      COUNT(*) as count,
      COALESCE(SUM(file_size), 0) as totalSize,
      COALESCE(SUM(duration), 0) as totalDuration
     FROM videos
     WHERE is_deleted = 0;`,
    []
  );

  const count = result?.count || 0;
  const totalSize = result?.totalSize || 0;
  const totalDuration = result?.totalDuration || 0;

  return {
    count,
    totalSize,
    averageSize: count > 0 ? totalSize / count : 0,
    totalDuration,
    averageDuration: count > 0 ? totalDuration / count : 0,
  };
};

/**
 * Insert videos (batch operation)
 *
 * @param videos Array of videos to insert
 * @returns Promise<void>
 */
export const insertVideos = async (videos: Omit<Video, 'created_at' | 'updated_at'>[]): Promise<void> => {
  if (videos.length === 0) {
    return;
  }

  await executeTransaction(async (db) => {
    for (const video of videos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO videos (
          id, uri, filename, file_size, width, height, duration,
          creation_time, modification_time, is_deleted,
          album_id, location_latitude, location_longitude
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          video.id,
          video.uri,
          video.filename,
          video.file_size,
          video.width ?? null,
          video.height ?? null,
          video.duration ?? null,
          video.creation_time ?? null,
          video.modification_time ?? null,
          video.is_deleted,
          video.album_id ?? null,
          video.location_latitude ?? null,
          video.location_longitude ?? null,
        ]
      );
    }
  });
};

/**
 * Update video
 *
 * @param id Video ID
 * @param data Partial video data to update
 * @returns Promise<void>
 */
export const updateVideo = async (
  id: string,
  data: Partial<Omit<Video, 'id' | 'created_at'>>
): Promise<void> => {
  // Build SET clause dynamically
  const updates: string[] = [];
  const params: any[] = [];

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at') {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  });

  // Always update updated_at
  updates.push('updated_at = strftime("%s", "now")');

  // Add id to params
  params.push(id);

  const query = `UPDATE videos SET ${updates.join(', ')} WHERE id = ?;`;

  await executeNonQuery(query, params);
};

/**
 * Delete video (soft delete)
 *
 * @param id Video ID
 * @returns Promise<void>
 */
export const deleteVideo = async (id: string): Promise<void> => {
  await executeNonQuery(
    'UPDATE videos SET is_deleted = 1, updated_at = strftime("%s", "now") WHERE id = ?;',
    [id]
  );
};

/**
 * Delete multiple videos (soft delete, batch operation)
 *
 * @param ids Array of video IDs
 * @returns Promise<void>
 */
export const deleteVideos = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) {
    return;
  }

  await executeTransaction(async (db) => {
    for (const id of ids) {
      await db.runAsync(
        'UPDATE videos SET is_deleted = 1, updated_at = strftime("%s", "now") WHERE id = ?;',
        [id]
      );
    }
  });
};

/**
 * Permanently delete video from database
 *
 * @param id Video ID
 * @returns Promise<void>
 */
export const hardDeleteVideo = async (id: string): Promise<void> => {
  await executeNonQuery('DELETE FROM videos WHERE id = ?;', [id]);
};

/**
 * Check if video exists
 *
 * @param id Video ID
 * @returns Promise<boolean>
 */
export const videoExists = async (id: string): Promise<boolean> => {
  const result = await executeQueryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM videos WHERE id = ?;',
    [id]
  );

  return (result?.count || 0) > 0;
};

/**
 * Get videos by album
 *
 * @param albumId Album ID
 * @param limit Maximum number of results
 * @returns Promise<Video[]>
 */
export const getVideosByAlbum = async (
  albumId: string,
  limit: number = 100
): Promise<Video[]> => {
  const videos = await executeQuery<Video>(
    `SELECT * FROM videos
     WHERE is_deleted = 0 AND album_id = ?
     ORDER BY creation_time DESC
     LIMIT ?;`,
    [albumId, limit]
  );

  return videos;
};

/**
 * Get recently added videos
 *
 * @param days Number of days to look back (default 7)
 * @param limit Maximum number of results
 * @returns Promise<Video[]>
 */
export const getRecentVideos = async (
  days: number = 7,
  limit: number = 50
): Promise<Video[]> => {
  const timestamp = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  const videos = await executeQuery<Video>(
    `SELECT * FROM videos
     WHERE is_deleted = 0 AND created_at >= ?
     ORDER BY created_at DESC
     LIMIT ?;`,
    [timestamp, limit]
  );

  return videos;
};

/**
 * Search videos by filename
 *
 * @param searchTerm Search term
 * @param limit Maximum number of results
 * @returns Promise<Video[]>
 */
export const searchVideos = async (
  searchTerm: string,
  limit: number = 50
): Promise<Video[]> => {
  const videos = await executeQuery<Video>(
    `SELECT * FROM videos
     WHERE is_deleted = 0 AND filename LIKE ?
     ORDER BY creation_time DESC
     LIMIT ?;`,
    [`%${searchTerm}%`, limit]
  );

  return videos;
};
