/**
 * Photo Hashes query module
 *
 * This module manages photo hashes for duplicate detection.
 *
 * Hash types (based on CLAUDE.md):
 * - MD5: Exact duplicate detection (file content hash)
 * - Perceptual: Visual similarity detection (0-5 Hamming distance = very similar)
 * - DHash: Difference hash for detecting rotations
 * - Average: Basic similarity detection
 *
 * Two-phase hashing approach:
 * 1. MD5 generated immediately during scan
 * 2. Advanced hashes (perceptual, dhash, average) generated in background
 */

import { executeQuery, executeQueryFirst, executeNonQuery, executeTransaction, getDatabase } from '../init';

/**
 * Photo hash type definition
 */
export interface PhotoHash {
  id: number;
  photo_id: string;
  md5_hash?: string;
  perceptual_hash?: string;
  dhash?: string;
  average_hash?: string;
  hash_generated_at?: number;
}

/**
 * Hash insert data (without ID and timestamp)
 */
export interface PhotoHashInsert {
  photo_id: string;
  md5_hash?: string;
  perceptual_hash?: string;
  dhash?: string;
  average_hash?: string;
}

/**
 * Insert photo hash data
 *
 * @param hashData Hash data to insert
 * @returns Promise<void>
 */
export const insertHash = async (hashData: PhotoHashInsert): Promise<void> => {
  await executeNonQuery(
    `INSERT INTO photo_hashes (photo_id, md5_hash, perceptual_hash, dhash, average_hash)
     VALUES (?, ?, ?, ?, ?);`,
    [
      hashData.photo_id,
      hashData.md5_hash || null,
      hashData.perceptual_hash || null,
      hashData.dhash || null,
      hashData.average_hash || null,
    ]
  );
};

/**
 * Insert multiple photo hashes in batch
 *
 * Critical for performance when processing 100+ photos at once.
 *
 * @param hashes Array of hash data
 * @returns Promise<void>
 */
export const insertHashes = async (hashes: PhotoHashInsert[]): Promise<void> => {
  if (hashes.length === 0) {
    return;
  }

  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    for (const hashData of hashes) {
      await db.runAsync(
        `INSERT OR IGNORE INTO photo_hashes (photo_id, md5_hash, perceptual_hash, dhash, average_hash)
         VALUES (?, ?, ?, ?, ?);`,
        [
          hashData.photo_id,
          hashData.md5_hash || null,
          hashData.perceptual_hash || null,
          hashData.dhash || null,
          hashData.average_hash || null,
        ]
      );
    }
  });

  console.log(`[Hashes] Inserted ${hashes.length} photo hashes in batch`);
};

/**
 * Get hash by photo ID
 *
 * @param photoId Photo ID
 * @returns Promise<PhotoHash | null>
 */
export const getHashByPhotoId = async (photoId: string): Promise<PhotoHash | null> => {
  const hash = await executeQueryFirst<PhotoHash>(
    'SELECT * FROM photo_hashes WHERE photo_id = ?;',
    [photoId]
  );

  return hash;
};

/**
 * Get all hashes for duplicate detection
 *
 * This retrieves all photo hashes to compare for duplicates.
 * Only includes photos that are not deleted.
 *
 * @returns Promise<PhotoHash[]>
 */
export const getAllHashesForDuplicateDetection = async (): Promise<PhotoHash[]> => {
  const hashes = await executeQuery<PhotoHash>(
    `SELECT ph.* FROM photo_hashes ph
     INNER JOIN photos p ON ph.photo_id = p.id
     WHERE p.is_deleted = 0;`,
    []
  );

  return hashes;
};

/**
 * Get photos with the same MD5 hash (exact duplicates)
 *
 * Uses indexed query for performance.
 *
 * @param md5Hash MD5 hash to search for
 * @returns Promise<PhotoHash[]>
 */
export const getPhotosByMD5Hash = async (md5Hash: string): Promise<PhotoHash[]> => {
  const hashes = await executeQuery<PhotoHash>(
    `SELECT ph.* FROM photo_hashes ph
     INNER JOIN photos p ON ph.photo_id = p.id
     WHERE ph.md5_hash = ? AND p.is_deleted = 0;`,
    [md5Hash]
  );

  return hashes;
};

/**
 * Get all photos grouped by MD5 hash
 *
 * Returns groups where multiple photos share the same MD5 hash (exact duplicates).
 *
 * @returns Promise<Map<string, PhotoHash[]>>
 */
export const getExactDuplicateGroups = async (): Promise<Map<string, PhotoHash[]>> => {
  // Get all hashes that appear more than once
  const hashes = await executeQuery<PhotoHash>(
    `SELECT ph.* FROM photo_hashes ph
     INNER JOIN photos p ON ph.photo_id = p.id
     WHERE ph.md5_hash IS NOT NULL
       AND p.is_deleted = 0
       AND ph.md5_hash IN (
         SELECT md5_hash FROM photo_hashes
         WHERE md5_hash IS NOT NULL
         GROUP BY md5_hash
         HAVING COUNT(*) > 1
       )
     ORDER BY ph.md5_hash;`,
    []
  );

  // Group by MD5 hash
  const groups = new Map<string, PhotoHash[]>();

  hashes.forEach((hash) => {
    if (!hash.md5_hash) return;

    if (!groups.has(hash.md5_hash)) {
      groups.set(hash.md5_hash, []);
    }

    groups.get(hash.md5_hash)!.push(hash);
  });

  return groups;
};

/**
 * Update specific hash type for a photo
 *
 * Useful for the two-phase hashing approach:
 * 1. Insert MD5 immediately
 * 2. Update with advanced hashes later
 *
 * @param photoId Photo ID
 * @param hashType Type of hash to update
 * @param value Hash value
 * @returns Promise<void>
 */
export const updateHash = async (
  photoId: string,
  hashType: 'md5_hash' | 'perceptual_hash' | 'dhash' | 'average_hash',
  value: string
): Promise<void> => {
  await executeNonQuery(
    `UPDATE photo_hashes
     SET ${hashType} = ?,
         hash_generated_at = strftime('%s', 'now')
     WHERE photo_id = ?;`,
    [value, photoId]
  );
};

/**
 * Update all advanced hashes for a photo
 *
 * Used in phase 2 of hashing (background processing).
 *
 * @param photoId Photo ID
 * @param perceptualHash Perceptual hash
 * @param dhash Difference hash
 * @param averageHash Average hash
 * @returns Promise<void>
 */
export const updateAdvancedHashes = async (
  photoId: string,
  perceptualHash: string,
  dhash: string,
  averageHash: string
): Promise<void> => {
  await executeNonQuery(
    `UPDATE photo_hashes
     SET perceptual_hash = ?,
         dhash = ?,
         average_hash = ?,
         hash_generated_at = strftime('%s', 'now')
     WHERE photo_id = ?;`,
    [perceptualHash, dhash, averageHash, photoId]
  );
};

/**
 * Get photos missing advanced hashes
 *
 * Returns photo IDs that have MD5 but are missing perceptual/dhash/average hashes.
 * Useful for background hash generation queue.
 *
 * @param limit Maximum number of photos to return
 * @returns Promise<string[]> Array of photo IDs
 */
export const getPhotosMissingAdvancedHashes = async (limit = 100): Promise<string[]> => {
  const results = await executeQuery<{ photo_id: string }>(
    `SELECT ph.photo_id FROM photo_hashes ph
     INNER JOIN photos p ON ph.photo_id = p.id
     WHERE p.is_deleted = 0
       AND ph.md5_hash IS NOT NULL
       AND (ph.perceptual_hash IS NULL OR ph.dhash IS NULL OR ph.average_hash IS NULL)
     LIMIT ?;`,
    [limit]
  );

  return results.map((r) => r.photo_id);
};

/**
 * Get all perceptual hashes for similarity comparison
 *
 * Used by DuplicateDetector to find visually similar photos.
 *
 * @returns Promise<Array<{photo_id: string, perceptual_hash: string}>>
 */
export const getAllPerceptualHashes = async (): Promise<
  Array<{ photo_id: string; perceptual_hash: string }>
> => {
  const results = await executeQuery<{ photo_id: string; perceptual_hash: string }>(
    `SELECT ph.photo_id, ph.perceptual_hash FROM photo_hashes ph
     INNER JOIN photos p ON ph.photo_id = p.id
     WHERE ph.perceptual_hash IS NOT NULL
       AND p.is_deleted = 0;`,
    []
  );

  return results;
};

/**
 * Delete hash by photo ID
 *
 * Called when a photo is permanently deleted.
 * Note: ON DELETE CASCADE in schema will handle this automatically,
 * but this function is provided for explicit control.
 *
 * @param photoId Photo ID
 * @returns Promise<void>
 */
export const deleteHash = async (photoId: string): Promise<void> => {
  await executeNonQuery('DELETE FROM photo_hashes WHERE photo_id = ?;', [photoId]);
};

/**
 * Delete multiple hashes in batch
 *
 * @param photoIds Array of photo IDs
 * @returns Promise<void>
 */
export const deleteHashes = async (photoIds: string[]): Promise<void> => {
  if (photoIds.length === 0) {
    return;
  }

  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    for (const photoId of photoIds) {
      await db.runAsync('DELETE FROM photo_hashes WHERE photo_id = ?;', [photoId]);
    }
  });

  console.log(`[Hashes] Deleted ${photoIds.length} photo hashes`);
};

/**
 * Get hash statistics
 *
 * Returns counts of photos with different hash types.
 * Useful for monitoring hash generation progress.
 *
 * @returns Promise with hash statistics
 */
export const getHashStatistics = async (): Promise<{
  total: number;
  withMD5: number;
  withPerceptual: number;
  withDHash: number;
  withAverage: number;
  withAllHashes: number;
}> => {
  const result = await executeQueryFirst<{
    total: number;
    with_md5: number;
    with_perceptual: number;
    with_dhash: number;
    with_average: number;
    with_all: number;
  }>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN md5_hash IS NOT NULL THEN 1 ELSE 0 END) as with_md5,
      SUM(CASE WHEN perceptual_hash IS NOT NULL THEN 1 ELSE 0 END) as with_perceptual,
      SUM(CASE WHEN dhash IS NOT NULL THEN 1 ELSE 0 END) as with_dhash,
      SUM(CASE WHEN average_hash IS NOT NULL THEN 1 ELSE 0 END) as with_average,
      SUM(CASE WHEN md5_hash IS NOT NULL AND perceptual_hash IS NOT NULL AND dhash IS NOT NULL AND average_hash IS NOT NULL THEN 1 ELSE 0 END) as with_all
     FROM photo_hashes ph
     INNER JOIN photos p ON ph.photo_id = p.id
     WHERE p.is_deleted = 0;`,
    []
  );

  return {
    total: result?.total || 0,
    withMD5: result?.with_md5 || 0,
    withPerceptual: result?.with_perceptual || 0,
    withDHash: result?.with_dhash || 0,
    withAverage: result?.with_average || 0,
    withAllHashes: result?.with_all || 0,
  };
};

/**
 * Check if photo has all hashes generated
 *
 * @param photoId Photo ID
 * @returns Promise<boolean>
 */
export const hasAllHashes = async (photoId: string): Promise<boolean> => {
  const hash = await getHashByPhotoId(photoId);

  if (!hash) {
    return false;
  }

  return !!(
    hash.md5_hash &&
    hash.perceptual_hash &&
    hash.dhash &&
    hash.average_hash
  );
};
