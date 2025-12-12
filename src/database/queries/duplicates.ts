/**
 * Duplicates query module
 *
 * This module manages duplicate groups and photo-to-group mappings.
 *
 * Based on CLAUDE.md duplicate detection algorithms:
 * - Exact: Same MD5 (confidence 1.0)
 * - Visual similarity: Perceptual hash + Hamming distance (0-5 = very similar, confidence 0.92)
 * - Burst: Photos within 2 seconds + same location (confidence 0.95)
 * - Screenshot groups: Date-based clustering (confidence 0.85)
 */

import { executeQuery, executeQueryFirst, executeNonQuery, executeTransaction, getDatabase } from '../init';

/**
 * Duplicate group types
 */
export type DuplicateGroupType = 'exact' | 'similar' | 'burst' | 'screenshot';

/**
 * Duplicate group type definition
 */
export interface DuplicateGroup {
  id: number;
  group_type: DuplicateGroupType;
  confidence_score: number;
  total_size?: number;
  potential_savings?: number;
  photo_count: number;
  is_resolved: number;
  created_at: number;
  resolved_at?: number;
}

/**
 * Photo-to-duplicate-group mapping
 */
export interface PhotoDuplicateMapping {
  id: number;
  photo_id: string;
  group_id: number;
  is_primary: number;
  quality_score?: number;
}

/**
 * Duplicate group with photos
 */
export interface DuplicateGroupWithPhotos extends DuplicateGroup {
  photos: Array<{
    photo_id: string;
    is_primary: boolean;
    quality_score?: number;
    uri?: string;
    filename?: string;
    file_size?: number;
    creation_time?: number;
  }>;
}

/**
 * Create a new duplicate group
 *
 * @param groupData Group data
 * @returns Promise<number> Group ID
 */
export const createDuplicateGroup = async (
  groupData: Omit<DuplicateGroup, 'id' | 'photo_count' | 'created_at' | 'resolved_at'>
): Promise<number> => {
  const result = await executeNonQuery(
    `INSERT INTO duplicate_groups (group_type, confidence_score, total_size, potential_savings, is_resolved)
     VALUES (?, ?, ?, ?, ?);`,
    [
      groupData.group_type,
      groupData.confidence_score,
      groupData.total_size || null,
      groupData.potential_savings || null,
      groupData.is_resolved,
    ]
  );

  return result.lastInsertRowId;
};

/**
 * Add a photo to a duplicate group
 *
 * @param photoId Photo ID
 * @param groupId Group ID
 * @param isPrimary Whether this is the recommended photo to keep
 * @param qualityScore Optional quality score (for AI quality ranking)
 * @returns Promise<void>
 */
export const addPhotoToGroup = async (
  photoId: string,
  groupId: number,
  isPrimary = false,
  qualityScore?: number
): Promise<void> => {
  await executeNonQuery(
    `INSERT OR IGNORE INTO photo_duplicate_mapping (photo_id, group_id, is_primary, quality_score)
     VALUES (?, ?, ?, ?);`,
    [photoId, groupId, isPrimary ? 1 : 0, qualityScore || null]
  );

  // Update group photo count
  await executeNonQuery(
    `UPDATE duplicate_groups
     SET photo_count = (SELECT COUNT(*) FROM photo_duplicate_mapping WHERE group_id = ?)
     WHERE id = ?;`,
    [groupId, groupId]
  );
};

/**
 * Add multiple photos to a group in batch
 *
 * @param groupId Group ID
 * @param photoMappings Array of photo mappings
 * @returns Promise<void>
 */
export const addPhotosToGroup = async (
  groupId: number,
  photoMappings: Array<{ photoId: string; isPrimary?: boolean; qualityScore?: number }>
): Promise<void> => {
  if (photoMappings.length === 0) {
    return;
  }

  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    for (const mapping of photoMappings) {
      await db.runAsync(
        `INSERT OR IGNORE INTO photo_duplicate_mapping (photo_id, group_id, is_primary, quality_score)
         VALUES (?, ?, ?, ?);`,
        [mapping.photoId, groupId, mapping.isPrimary ? 1 : 0, mapping.qualityScore || null]
      );
    }

    // Update group photo count
    await db.runAsync(
      `UPDATE duplicate_groups
       SET photo_count = (SELECT COUNT(*) FROM photo_duplicate_mapping WHERE group_id = ?)
       WHERE id = ?;`,
      [groupId, groupId]
    );
  });

  console.log(`[Duplicates] Added ${photoMappings.length} photos to group ${groupId}`);
};

/**
 * Get all duplicate groups
 *
 * @param includeResolved Include resolved groups
 * @returns Promise<DuplicateGroup[]>
 */
export const getDuplicateGroups = async (includeResolved = false): Promise<DuplicateGroup[]> => {
  const whereClause = includeResolved ? '' : 'WHERE is_resolved = 0';

  const groups = await executeQuery<DuplicateGroup>(
    `SELECT * FROM duplicate_groups
     ${whereClause}
     ORDER BY created_at DESC;`,
    []
  );

  return groups;
};

/**
 * Get duplicate group by ID
 *
 * @param groupId Group ID
 * @returns Promise<DuplicateGroup | null>
 */
export const getDuplicateGroupById = async (groupId: number): Promise<DuplicateGroup | null> => {
  const group = await executeQueryFirst<DuplicateGroup>(
    'SELECT * FROM duplicate_groups WHERE id = ?;',
    [groupId]
  );

  return group;
};

/**
 * Get duplicate group with all photos
 *
 * @param groupId Group ID
 * @returns Promise<DuplicateGroupWithPhotos | null>
 */
export const getDuplicateGroupWithPhotos = async (
  groupId: number
): Promise<DuplicateGroupWithPhotos | null> => {
  const group = await getDuplicateGroupById(groupId);

  if (!group) {
    return null;
  }

  // Get photos in this group
  const photos = await executeQuery<{
    photo_id: string;
    is_primary: number;
    quality_score?: number;
    uri?: string;
    filename?: string;
    file_size?: number;
    creation_time?: number;
  }>(
    `SELECT
      pdm.photo_id,
      pdm.is_primary,
      pdm.quality_score,
      p.uri,
      p.filename,
      p.file_size,
      p.creation_time
     FROM photo_duplicate_mapping pdm
     INNER JOIN photos p ON pdm.photo_id = p.id
     WHERE pdm.group_id = ?
     ORDER BY pdm.is_primary DESC, pdm.quality_score DESC;`,
    [groupId]
  );

  return {
    ...group,
    photos: photos.map((p) => ({
      photo_id: p.photo_id,
      is_primary: p.is_primary === 1,
      quality_score: p.quality_score,
      uri: p.uri,
      filename: p.filename,
      file_size: p.file_size,
      creation_time: p.creation_time,
    })),
  };
};

/**
 * Get all duplicate groups with photos
 *
 * @param includeResolved Include resolved groups
 * @returns Promise<DuplicateGroupWithPhotos[]>
 */
export const getAllDuplicateGroupsWithPhotos = async (
  includeResolved = false
): Promise<DuplicateGroupWithPhotos[]> => {
  const groups = await getDuplicateGroups(includeResolved);

  const groupsWithPhotos: DuplicateGroupWithPhotos[] = [];

  for (const group of groups) {
    const groupWithPhotos = await getDuplicateGroupWithPhotos(group.id);
    if (groupWithPhotos) {
      groupsWithPhotos.push(groupWithPhotos);
    }
  }

  return groupsWithPhotos;
};

/**
 * Update group recommendation (set primary photo)
 *
 * @param groupId Group ID
 * @param primaryPhotoId Photo ID to set as primary
 * @returns Promise<void>
 */
export const updateGroupRecommendation = async (
  groupId: number,
  primaryPhotoId: string
): Promise<void> => {
  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    // Clear all primary flags in this group
    await db.runAsync(
      'UPDATE photo_duplicate_mapping SET is_primary = 0 WHERE group_id = ?;',
      [groupId]
    );

    // Set new primary
    await db.runAsync(
      'UPDATE photo_duplicate_mapping SET is_primary = 1 WHERE group_id = ? AND photo_id = ?;',
      [groupId, primaryPhotoId]
    );
  });

  console.log(`[Duplicates] Updated primary photo for group ${groupId} to ${primaryPhotoId}`);
};

/**
 * Mark duplicate group as resolved
 *
 * Called after user has taken action on the group (kept some, deleted others).
 *
 * @param groupId Group ID
 * @returns Promise<void>
 */
export const markGroupResolved = async (groupId: number): Promise<void> => {
  await executeNonQuery(
    `UPDATE duplicate_groups
     SET is_resolved = 1,
         resolved_at = strftime('%s', 'now')
     WHERE id = ?;`,
    [groupId]
  );

  console.log(`[Duplicates] Marked group ${groupId} as resolved`);
};

/**
 * Delete duplicate group
 *
 * This also deletes all photo mappings (CASCADE in schema).
 *
 * @param groupId Group ID
 * @returns Promise<void>
 */
export const deleteDuplicateGroup = async (groupId: number): Promise<void> => {
  await executeNonQuery('DELETE FROM duplicate_groups WHERE id = ?;', [groupId]);

  console.log(`[Duplicates] Deleted group ${groupId}`);
};

/**
 * Remove photo from group
 *
 * @param photoId Photo ID
 * @param groupId Group ID
 * @returns Promise<void>
 */
export const removePhotoFromGroup = async (photoId: string, groupId: number): Promise<void> => {
  await executeNonQuery(
    'DELETE FROM photo_duplicate_mapping WHERE photo_id = ? AND group_id = ?;',
    [photoId, groupId]
  );

  // Update group photo count
  await executeNonQuery(
    `UPDATE duplicate_groups
     SET photo_count = (SELECT COUNT(*) FROM photo_duplicate_mapping WHERE group_id = ?)
     WHERE id = ?;`,
    [groupId, groupId]
  );
};

/**
 * Get all groups containing a specific photo
 *
 * @param photoId Photo ID
 * @returns Promise<DuplicateGroup[]>
 */
export const getGroupsForPhoto = async (photoId: string): Promise<DuplicateGroup[]> => {
  const groups = await executeQuery<DuplicateGroup>(
    `SELECT dg.* FROM duplicate_groups dg
     INNER JOIN photo_duplicate_mapping pdm ON dg.id = pdm.group_id
     WHERE pdm.photo_id = ?
     ORDER BY dg.created_at DESC;`,
    [photoId]
  );

  return groups;
};

/**
 * Calculate and update group statistics
 *
 * Recalculates total_size and potential_savings for a group.
 *
 * @param groupId Group ID
 * @returns Promise<void>
 */
export const updateGroupStatistics = async (groupId: number): Promise<void> => {
  // Get all photos in group
  const photos = await executeQuery<{ file_size: number; is_primary: number }>(
    `SELECT p.file_size, pdm.is_primary
     FROM photo_duplicate_mapping pdm
     INNER JOIN photos p ON pdm.photo_id = p.id
     WHERE pdm.group_id = ? AND p.is_deleted = 0;`,
    [groupId]
  );

  if (photos.length === 0) {
    return;
  }

  // Calculate total size
  const totalSize = photos.reduce((sum, p) => sum + p.file_size, 0);

  // Calculate potential savings (all except primary photo)
  const primaryPhoto = photos.find((p) => p.is_primary === 1);
  const potentialSavings = primaryPhoto
    ? totalSize - primaryPhoto.file_size
    : totalSize - Math.max(...photos.map((p) => p.file_size)); // If no primary, keep largest

  await executeNonQuery(
    `UPDATE duplicate_groups
     SET total_size = ?,
         potential_savings = ?,
         photo_count = ?
     WHERE id = ?;`,
    [totalSize, potentialSavings, photos.length, groupId]
  );
};

/**
 * Get total potential savings across all unresolved groups
 *
 * @returns Promise<number> Total savings in bytes
 */
export const getTotalPotentialSavings = async (): Promise<number> => {
  const result = await executeQueryFirst<{ total: number }>(
    'SELECT COALESCE(SUM(potential_savings), 0) as total FROM duplicate_groups WHERE is_resolved = 0;',
    []
  );

  return result ? result.total : 0;
};

/**
 * Get duplicate group statistics
 *
 * @returns Promise with statistics
 */
export const getDuplicateStatistics = async (): Promise<{
  totalGroups: number;
  resolvedGroups: number;
  unresolvedGroups: number;
  totalPhotosInGroups: number;
  potentialSavings: number;
  groupsByType: Record<DuplicateGroupType, number>;
}> => {
  const stats = await executeQueryFirst<{
    total_groups: number;
    resolved_groups: number;
    unresolved_groups: number;
    total_photos: number;
    potential_savings: number;
  }>(
    `SELECT
      COUNT(*) as total_groups,
      SUM(CASE WHEN is_resolved = 1 THEN 1 ELSE 0 END) as resolved_groups,
      SUM(CASE WHEN is_resolved = 0 THEN 1 ELSE 0 END) as unresolved_groups,
      SUM(photo_count) as total_photos,
      SUM(CASE WHEN is_resolved = 0 THEN potential_savings ELSE 0 END) as potential_savings
     FROM duplicate_groups;`,
    []
  );

  // Get counts by type
  const typeStats = await executeQuery<{ group_type: DuplicateGroupType; count: number }>(
    `SELECT group_type, COUNT(*) as count
     FROM duplicate_groups
     WHERE is_resolved = 0
     GROUP BY group_type;`,
    []
  );

  const groupsByType: Record<DuplicateGroupType, number> = {
    exact: 0,
    similar: 0,
    burst: 0,
    screenshot: 0,
  };

  typeStats.forEach((stat) => {
    groupsByType[stat.group_type] = stat.count;
  });

  return {
    totalGroups: stats?.total_groups || 0,
    resolvedGroups: stats?.resolved_groups || 0,
    unresolvedGroups: stats?.unresolved_groups || 0,
    totalPhotosInGroups: stats?.total_photos || 0,
    potentialSavings: stats?.potential_savings || 0,
    groupsByType,
  };
};

/**
 * Clear all resolved duplicate groups
 *
 * Removes groups that have been resolved to keep database clean.
 *
 * @returns Promise<number> Number of groups deleted
 */
export const clearResolvedGroups = async (): Promise<number> => {
  const result = await executeNonQuery('DELETE FROM duplicate_groups WHERE is_resolved = 1;', []);

  return result.changes;
};

/**
 * Check if photo is in any duplicate group
 *
 * @param photoId Photo ID
 * @returns Promise<boolean>
 */
export const isPhotoInDuplicateGroup = async (photoId: string): Promise<boolean> => {
  const result = await executeQueryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM photo_duplicate_mapping WHERE photo_id = ?;',
    [photoId]
  );

  return result ? result.count > 0 : false;
};
