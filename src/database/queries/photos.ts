/**
 * Photos query module
 *
 * This module contains all database operations related to photos.
 * All query functions are focused on performance (<100ms response time).
 *
 * Based on CLAUDE.md architecture:
 * - Batch operations for bulk inserts (100+ photos at a time)
 * - Pagination for large photo libraries
 * - Soft deletes (is_deleted flag) instead of hard deletes
 * - Indexed queries for common patterns
 */

import { executeQuery, executeQueryFirst, executeNonQuery, executeTransaction, getDatabase } from '../init';

/**
 * Photo type definition
 */
export interface Photo {
  id: string;
  uri: string;
  filename: string;
  file_size: number;
  width?: number;
  height?: number;
  creation_time?: number;
  modification_time?: number;
  media_type: string;
  is_screenshot: number;
  is_deleted: number;
  album_id?: string;
  location_latitude?: number;
  location_longitude?: number;
  exif_data?: string;
  created_at?: number;
  updated_at?: number;
}

/**
 * Photo filter options
 */
export interface PhotoFilter {
  mediaType?: string;
  isScreenshot?: boolean;
  minSize?: number;
  maxSize?: number;
  fromDate?: number;
  toDate?: number;
  albumId?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Get all photos with pagination
 *
 * @param options Pagination options
 * @returns Promise<Photo[]>
 */
export const getAllPhotos = async (
  options: PaginationOptions = {}
): Promise<Photo[]> => {
  const { limit = 100, offset = 0 } = options;

  const photos = await executeQuery<Photo>(
    `SELECT * FROM photos
     WHERE is_deleted = 0
     ORDER BY creation_time DESC
     LIMIT ? OFFSET ?;`,
    [limit, offset]
  );

  return photos;
};

/**
 * Get photo by ID
 *
 * @param id Photo ID
 * @returns Promise<Photo | null>
 */
export const getPhotoById = async (id: string): Promise<Photo | null> => {
  const photo = await executeQueryFirst<Photo>(
    'SELECT * FROM photos WHERE id = ? AND is_deleted = 0;',
    [id]
  );

  return photo;
};

/**
 * Get photos by filter
 *
 * @param filter Filter options
 * @param pagination Pagination options
 * @returns Promise<Photo[]>
 */
export const getPhotosByFilter = async (
  filter: PhotoFilter,
  pagination: PaginationOptions = {}
): Promise<Photo[]> => {
  const { limit = 100, offset = 0 } = pagination;

  // Build WHERE clause dynamically based on filter
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];

  if (filter.mediaType) {
    conditions.push('media_type = ?');
    params.push(filter.mediaType);
  }

  if (filter.isScreenshot !== undefined) {
    conditions.push('is_screenshot = ?');
    params.push(filter.isScreenshot ? 1 : 0);
  }

  if (filter.minSize !== undefined) {
    conditions.push('file_size >= ?');
    params.push(filter.minSize);
  }

  if (filter.maxSize !== undefined) {
    conditions.push('file_size <= ?');
    params.push(filter.maxSize);
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

  const whereClause = conditions.join(' AND ');

  // Add pagination params
  params.push(limit, offset);

  const photos = await executeQuery<Photo>(
    `SELECT * FROM photos
     WHERE ${whereClause}
     ORDER BY creation_time DESC
     LIMIT ? OFFSET ?;`,
    params
  );

  return photos;
};

/**
 * Get all screenshots
 *
 * Uses indexed query for performance.
 *
 * @param pagination Pagination options
 * @returns Promise<Photo[]>
 */
export const getScreenshots = async (
  pagination: PaginationOptions = {}
): Promise<Photo[]> => {
  const { limit = 100, offset = 0 } = pagination;

  const photos = await executeQuery<Photo>(
    `SELECT * FROM photos
     WHERE is_screenshot = 1 AND is_deleted = 0
     ORDER BY creation_time DESC
     LIMIT ? OFFSET ?;`,
    [limit, offset]
  );

  return photos;
};

/**
 * Get large files above a size threshold
 *
 * Uses indexed query for performance.
 *
 * @param minSizeBytes Minimum file size in bytes
 * @param pagination Pagination options
 * @returns Promise<Photo[]>
 */
export const getLargeFiles = async (
  minSizeBytes: number,
  pagination: PaginationOptions = {}
): Promise<Photo[]> => {
  const { limit = 100, offset = 0 } = pagination;

  const photos = await executeQuery<Photo>(
    `SELECT * FROM photos
     WHERE file_size >= ? AND is_deleted = 0
     ORDER BY file_size DESC
     LIMIT ? OFFSET ?;`,
    [minSizeBytes, limit, offset]
  );

  return photos;
};

/**
 * Insert a single photo
 *
 * @param photo Photo data
 * @returns Promise<void>
 */
export const insertPhoto = async (photo: Omit<Photo, 'created_at' | 'updated_at'>): Promise<void> => {
  await executeNonQuery(
    `INSERT INTO photos (
      id, uri, filename, file_size, width, height,
      creation_time, modification_time, media_type, is_screenshot,
      is_deleted, album_id, location_latitude, location_longitude, exif_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      photo.id,
      photo.uri,
      photo.filename,
      photo.file_size,
      photo.width || null,
      photo.height || null,
      photo.creation_time || null,
      photo.modification_time || null,
      photo.media_type,
      photo.is_screenshot,
      photo.is_deleted,
      photo.album_id || null,
      photo.location_latitude || null,
      photo.location_longitude || null,
      photo.exif_data || null,
    ]
  );
};

/**
 * Insert multiple photos in a batch transaction
 *
 * CRITICAL: For performance, use this for bulk inserts (100+ photos).
 * Based on CLAUDE.md: "Batch transactions for bulk operations (100+ rows)"
 *
 * @param photos Array of photos to insert
 * @returns Promise<void>
 */
export const insertPhotos = async (photos: Omit<Photo, 'created_at' | 'updated_at'>[]): Promise<void> => {
  if (photos.length === 0) {
    return;
  }

  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    for (const photo of photos) {
      await db.runAsync(
        `INSERT OR IGNORE INTO photos (
          id, uri, filename, file_size, width, height,
          creation_time, modification_time, media_type, is_screenshot,
          is_deleted, album_id, location_latitude, location_longitude, exif_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          photo.id,
          photo.uri,
          photo.filename,
          photo.file_size,
          photo.width || null,
          photo.height || null,
          photo.creation_time || null,
          photo.modification_time || null,
          photo.media_type,
          photo.is_screenshot,
          photo.is_deleted,
          photo.album_id || null,
          photo.location_latitude || null,
          photo.location_longitude || null,
          photo.exif_data || null,
        ]
      );
    }
  });

  console.log(`[Photos] Inserted ${photos.length} photos in batch`);
};

/**
 * Update photo metadata
 *
 * @param id Photo ID
 * @param data Partial photo data to update
 * @returns Promise<void>
 */
export const updatePhoto = async (
  id: string,
  data: Partial<Omit<Photo, 'id' | 'created_at'>>
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

  // Add ID as last parameter
  params.push(id);

  await executeNonQuery(
    `UPDATE photos SET ${updates.join(', ')} WHERE id = ?;`,
    params
  );
};

/**
 * Soft delete a photo (set is_deleted flag)
 *
 * Based on CLAUDE.md: "Soft delete (set is_deleted flag)"
 *
 * @param id Photo ID
 * @returns Promise<void>
 */
export const deletePhoto = async (id: string): Promise<void> => {
  await executeNonQuery(
    'UPDATE photos SET is_deleted = 1, updated_at = strftime("%s", "now") WHERE id = ?;',
    [id]
  );
};

/**
 * Soft delete multiple photos in a batch
 *
 * @param ids Array of photo IDs
 * @returns Promise<void>
 */
export const deletePhotos = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) {
    return;
  }

  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    for (const id of ids) {
      await db.runAsync(
        'UPDATE photos SET is_deleted = 1, updated_at = strftime("%s", "now") WHERE id = ?;',
        [id]
      );
    }
  });

  console.log(`[Photos] Soft deleted ${ids.length} photos`);
};

/**
 * Restore a soft-deleted photo
 *
 * @param id Photo ID
 * @returns Promise<void>
 */
export const restorePhoto = async (id: string): Promise<void> => {
  await executeNonQuery(
    'UPDATE photos SET is_deleted = 0, updated_at = strftime("%s", "now") WHERE id = ?;',
    [id]
  );
};

/**
 * Hard delete a photo (permanently remove from database)
 *
 * WARNING: This is a destructive operation. Only use when necessary.
 *
 * @param id Photo ID
 * @returns Promise<void>
 */
export const hardDeletePhoto = async (id: string): Promise<void> => {
  await executeNonQuery('DELETE FROM photos WHERE id = ?;', [id]);
};

/**
 * Get total photo count
 *
 * @param includeDeleted Include soft-deleted photos in count
 * @returns Promise<number>
 */
export const getPhotoCount = async (includeDeleted = false): Promise<number> => {
  const whereClause = includeDeleted ? '' : 'WHERE is_deleted = 0';

  const result = await executeQueryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM photos ${whereClause};`,
    []
  );

  return result ? result.count : 0;
};

/**
 * Get total storage used by photos
 *
 * @param includeDeleted Include soft-deleted photos in calculation
 * @returns Promise<number> Total size in bytes
 */
export const getTotalPhotoSize = async (includeDeleted = false): Promise<number> => {
  const whereClause = includeDeleted ? '' : 'WHERE is_deleted = 0';

  const result = await executeQueryFirst<{ total: number }>(
    `SELECT COALESCE(SUM(file_size), 0) as total FROM photos ${whereClause};`,
    []
  );

  return result ? result.total : 0;
};

/**
 * Get photos grouped by date
 *
 * Useful for timeline views.
 *
 * @param pagination Pagination options
 * @returns Promise<Photo[]>
 */
export const getPhotosByDate = async (
  pagination: PaginationOptions = {}
): Promise<Photo[]> => {
  const { limit = 100, offset = 0 } = pagination;

  const photos = await executeQuery<Photo>(
    `SELECT * FROM photos
     WHERE is_deleted = 0
     ORDER BY date(creation_time, 'unixepoch') DESC, creation_time DESC
     LIMIT ? OFFSET ?;`,
    [limit, offset]
  );

  return photos;
};

/**
 * Search photos by filename
 *
 * @param searchTerm Search term (case-insensitive)
 * @param pagination Pagination options
 * @returns Promise<Photo[]>
 */
export const searchPhotosByFilename = async (
  searchTerm: string,
  pagination: PaginationOptions = {}
): Promise<Photo[]> => {
  const { limit = 100, offset = 0 } = pagination;

  const photos = await executeQuery<Photo>(
    `SELECT * FROM photos
     WHERE filename LIKE ? AND is_deleted = 0
     ORDER BY creation_time DESC
     LIMIT ? OFFSET ?;`,
    [`%${searchTerm}%`, limit, offset]
  );

  return photos;
};
