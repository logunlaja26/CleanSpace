/**
 * Scan History Query Module
 *
 * Handles all database operations related to scan history tracking.
 * Records every scan performed by the user for audit trail and analytics.
 */

import { executeQuery, executeQueryFirst, executeNonQuery } from '../init';

// Types
export interface ScanHistoryRecord {
  id: number;
  scan_type: 'full' | 'incremental' | 'quick';
  photos_scanned: number;
  duplicates_found: number;
  large_files_found: number;
  screenshots_found: number;
  duration_ms: number;
  created_at: string;
}

export interface CreateScanHistoryParams {
  scan_type: 'full' | 'incremental' | 'quick';
  photos_scanned: number;
  duplicates_found?: number;
  large_files_found?: number;
  screenshots_found?: number;
  duration_ms: number;
}

/**
 * Record a new scan in history
 */
export async function createScanRecord(params: CreateScanHistoryParams): Promise<number> {
  const result = await executeNonQuery(
    `INSERT INTO scan_history (
      scan_type,
      photos_scanned,
      duplicates_found,
      large_files_found,
      screenshots_found,
      duration_ms,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      params.scan_type,
      params.photos_scanned,
      params.duplicates_found || 0,
      params.large_files_found || 0,
      params.screenshots_found || 0,
      params.duration_ms,
    ]
  );
  return result.lastInsertRowId;
}

/**
 * Get the most recent scan record
 */
export async function getLastScan(): Promise<ScanHistoryRecord | null> {
  return executeQueryFirst<ScanHistoryRecord>(
    `SELECT * FROM scan_history
     ORDER BY created_at DESC
     LIMIT 1`,
    []
  );
}

/**
 * Get all scan history records
 */
export async function getAllScans(limit: number = 50): Promise<ScanHistoryRecord[]> {
  return executeQuery<ScanHistoryRecord>(
    `SELECT * FROM scan_history
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );
}

/**
 * Get scan statistics for analytics
 */
export async function getScanStats(): Promise<{
  totalScans: number;
  totalPhotosScan: number;
  totalDuplicatesFound: number;
  averageDuration: number;
}> {
  const row = await executeQueryFirst<any>(
    `SELECT
      COUNT(*) as totalScans,
      SUM(photos_scanned) as totalPhotosScanned,
      SUM(duplicates_found) as totalDuplicatesFound,
      AVG(duration_ms) as averageDuration
     FROM scan_history`,
    []
  );

  return {
    totalScans: row?.totalScans || 0,
    totalPhotosScan: row?.totalPhotosScanned || 0,
    totalDuplicatesFound: row?.totalDuplicatesFound || 0,
    averageDuration: row?.averageDuration || 0,
  };
}

/**
 * Delete old scan records (keep only recent N records)
 */
export async function pruneOldScans(keepCount: number = 100): Promise<number> {
  const result = await executeNonQuery(
    `DELETE FROM scan_history
     WHERE id NOT IN (
       SELECT id FROM scan_history
       ORDER BY created_at DESC
       LIMIT ?
     )`,
    [keepCount]
  );
  return result.changes;
}
