/**
 * Sync queue query module
 *
 * This module manages the cloud sync queue.
 *
 * Based on CLAUDE.md architecture:
 * - Never blocks local operations
 * - All user actions update SQLite first (instant, offline-capable)
 * - Supabase sync happens in background via sync queue
 * - Exponential backoff for retries
 *
 * Data Flow: User Action → SQLite (instant) → Sync Queue (enqueue) → Supabase (background)
 */

import { executeQuery, executeQueryFirst, executeNonQuery, executeTransaction, getDatabase } from '../init';

/**
 * Sync operation types
 */
export type SyncOperationType = 'create' | 'update' | 'delete';

/**
 * Entity types that can be synced
 */
export type SyncEntityType =
  | 'preference'
  | 'duplicate_decision'
  | 'analytics_summary'
  | 'photo_hash';

/**
 * Sync status
 */
export type SyncStatus = 'pending' | 'syncing' | 'completed' | 'failed';

/**
 * Sync queue item type definition
 */
export interface SyncQueueItem {
  id: number;
  operation_type: SyncOperationType;
  entity_type: SyncEntityType;
  entity_id: string;
  payload?: string;
  retry_count: number;
  max_retries: number;
  status: SyncStatus;
  error_message?: string;
  created_at: number;
  last_attempt_at?: number;
  synced_at?: number;
}

/**
 * Cloud sync state
 */
export interface CloudSyncState {
  id: number;
  entity_type: SyncEntityType;
  last_sync_at?: number;
  last_sync_status?: string;
  pending_operations: number;
}

/**
 * Enqueue a sync item
 *
 * @param item Sync item data
 * @returns Promise<number> Item ID
 */
export const enqueueSyncItem = async (
  item: Omit<SyncQueueItem, 'id' | 'retry_count' | 'status' | 'created_at' | 'last_attempt_at' | 'synced_at'>
): Promise<number> => {
  const result = await executeNonQuery(
    `INSERT INTO sync_queue (operation_type, entity_type, entity_id, payload, max_retries, status)
     VALUES (?, ?, ?, ?, ?, 'pending');`,
    [
      item.operation_type,
      item.entity_type,
      item.entity_id,
      item.payload || null,
      item.max_retries || 3,
    ]
  );

  // Update pending operations count
  await updatePendingOperationsCount(item.entity_type);

  console.log(`[Sync] Enqueued ${item.operation_type} for ${item.entity_type}:${item.entity_id}`);

  return result.lastInsertRowId;
};

/**
 * Enqueue multiple sync items in batch
 *
 * @param items Array of sync items
 * @returns Promise<void>
 */
export const enqueueSyncItems = async (
  items: Array<Omit<SyncQueueItem, 'id' | 'retry_count' | 'status' | 'created_at' | 'last_attempt_at' | 'synced_at'>>
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const db = getDatabase();

  await executeTransaction(async (txn) => {
    for (const item of items) {
      await txn.runAsync(
        `INSERT INTO sync_queue (operation_type, entity_type, entity_id, payload, max_retries, status)
         VALUES (?, ?, ?, ?, ?, 'pending');`,
        [
          item.operation_type,
          item.entity_type,
          item.entity_id,
          item.payload || null,
          item.max_retries || 3,
        ]
      );
    }
  });

  // Update pending counts for all entity types
  const entityTypes = [...new Set(items.map((i) => i.entity_type))];
  for (const entityType of entityTypes) {
    await updatePendingOperationsCount(entityType);
  }

  console.log(`[Sync] Enqueued ${items.length} sync items in batch`);
};

/**
 * Get pending sync items
 *
 * Returns items ready to be synced (pending or failed with retries remaining).
 *
 * @param limit Maximum number of items to return
 * @returns Promise<SyncQueueItem[]>
 */
export const getPendingSyncItems = async (limit = 50): Promise<SyncQueueItem[]> => {
  const items = await executeQuery<SyncQueueItem>(
    `SELECT * FROM sync_queue
     WHERE status IN ('pending', 'failed')
       AND retry_count < max_retries
     ORDER BY created_at ASC
     LIMIT ?;`,
    [limit]
  );

  return items;
};

/**
 * Get pending items by entity type
 *
 * @param entityType Entity type
 * @param limit Maximum number of items
 * @returns Promise<SyncQueueItem[]>
 */
export const getPendingSyncItemsByType = async (
  entityType: SyncEntityType,
  limit = 50
): Promise<SyncQueueItem[]> => {
  const items = await executeQuery<SyncQueueItem>(
    `SELECT * FROM sync_queue
     WHERE entity_type = ?
       AND status IN ('pending', 'failed')
       AND retry_count < max_retries
     ORDER BY created_at ASC
     LIMIT ?;`,
    [entityType, limit]
  );

  return items;
};

/**
 * Mark sync item as syncing
 *
 * Called when starting to sync an item.
 *
 * @param itemId Item ID
 * @returns Promise<void>
 */
export const markSyncItemSyncing = async (itemId: number): Promise<void> => {
  await executeNonQuery(
    `UPDATE sync_queue
     SET status = 'syncing',
         last_attempt_at = strftime('%s', 'now')
     WHERE id = ?;`,
    [itemId]
  );
};

/**
 * Mark sync item as completed
 *
 * Called after successful sync.
 *
 * @param itemId Item ID
 * @returns Promise<void>
 */
export const markSyncItemComplete = async (itemId: number): Promise<void> => {
  // Get entity type before deletion
  const item = await executeQueryFirst<{ entity_type: SyncEntityType }>(
    'SELECT entity_type FROM sync_queue WHERE id = ?;',
    [itemId]
  );

  await executeNonQuery(
    `UPDATE sync_queue
     SET status = 'completed',
         synced_at = strftime('%s', 'now')
     WHERE id = ?;`,
    [itemId]
  );

  // Update pending operations count
  if (item) {
    await updatePendingOperationsCount(item.entity_type);
  }

  console.log(`[Sync] Item ${itemId} marked as completed`);
};

/**
 * Mark sync item as failed
 *
 * Called after a failed sync attempt. Increments retry count.
 *
 * @param itemId Item ID
 * @param error Error message
 * @returns Promise<void>
 */
export const markSyncItemFailed = async (itemId: number, error: string): Promise<void> => {
  await executeNonQuery(
    `UPDATE sync_queue
     SET status = 'failed',
         retry_count = retry_count + 1,
         error_message = ?,
         last_attempt_at = strftime('%s', 'now')
     WHERE id = ?;`,
    [error, itemId]
  );

  console.log(`[Sync] Item ${itemId} marked as failed: ${error}`);
};

/**
 * Delete completed sync items
 *
 * Cleans up old completed items to keep queue table small.
 *
 * @param olderThanDays Delete items completed more than X days ago
 * @returns Promise<number> Number of items deleted
 */
export const deleteCompletedSyncItems = async (olderThanDays = 7): Promise<number> => {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (olderThanDays * 24 * 60 * 60);

  const result = await executeNonQuery(
    `DELETE FROM sync_queue
     WHERE status = 'completed'
       AND synced_at < ?;`,
    [cutoffTimestamp]
  );

  console.log(`[Sync] Deleted ${result.changes} completed sync items`);

  return result.changes;
};

/**
 * Delete failed sync items that have exceeded max retries
 *
 * @returns Promise<number> Number of items deleted
 */
export const deleteFailedSyncItems = async (): Promise<number> => {
  const result = await executeNonQuery(
    `DELETE FROM sync_queue
     WHERE status = 'failed'
       AND retry_count >= max_retries;`,
    []
  );

  console.log(`[Sync] Deleted ${result.changes} permanently failed sync items`);

  return result.changes;
};

/**
 * Get sync state for an entity type
 *
 * @param entityType Entity type
 * @returns Promise<CloudSyncState | null>
 */
export const getSyncState = async (entityType: SyncEntityType): Promise<CloudSyncState | null> => {
  const state = await executeQueryFirst<CloudSyncState>(
    'SELECT * FROM cloud_sync_state WHERE entity_type = ?;',
    [entityType]
  );

  return state;
};

/**
 * Update sync state
 *
 * @param entityType Entity type
 * @param status Sync status
 * @returns Promise<void>
 */
export const updateSyncState = async (
  entityType: SyncEntityType,
  status: 'success' | 'failed'
): Promise<void> => {
  await executeNonQuery(
    `INSERT OR REPLACE INTO cloud_sync_state (entity_type, last_sync_at, last_sync_status, pending_operations)
     VALUES (
       ?,
       strftime('%s', 'now'),
       ?,
       (SELECT COUNT(*) FROM sync_queue WHERE entity_type = ? AND status IN ('pending', 'failed') AND retry_count < max_retries)
     );`,
    [entityType, status, entityType]
  );
};

/**
 * Update pending operations count for an entity type
 *
 * @param entityType Entity type
 * @returns Promise<void>
 */
const updatePendingOperationsCount = async (entityType: SyncEntityType): Promise<void> => {
  const count = await executeQueryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue
     WHERE entity_type = ?
       AND status IN ('pending', 'failed')
       AND retry_count < max_retries;`,
    [entityType]
  );

  await executeNonQuery(
    `INSERT OR REPLACE INTO cloud_sync_state (entity_type, pending_operations)
     VALUES (?, ?);`,
    [entityType, count?.count || 0]
  );
};

/**
 * Get total pending sync items count
 *
 * @returns Promise<number>
 */
export const getPendingSyncItemsCount = async (): Promise<number> => {
  const result = await executeQueryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue
     WHERE status IN ('pending', 'failed')
       AND retry_count < max_retries;`,
    []
  );

  return result ? result.count : 0;
};

/**
 * Get sync queue statistics
 *
 * @returns Promise with statistics
 */
export const getSyncQueueStatistics = async (): Promise<{
  totalItems: number;
  pendingItems: number;
  syncingItems: number;
  completedItems: number;
  failedItems: number;
  failedPermanently: number;
}> => {
  const stats = await executeQueryFirst<{
    total: number;
    pending: number;
    syncing: number;
    completed: number;
    failed: number;
    failed_permanently: number;
  }>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'syncing' THEN 1 ELSE 0 END) as syncing,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' AND retry_count < max_retries THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'failed' AND retry_count >= max_retries THEN 1 ELSE 0 END) as failed_permanently
     FROM sync_queue;`,
    []
  );

  return {
    totalItems: stats?.total || 0,
    pendingItems: stats?.pending || 0,
    syncingItems: stats?.syncing || 0,
    completedItems: stats?.completed || 0,
    failedItems: stats?.failed || 0,
    failedPermanently: stats?.failed_permanently || 0,
  };
};

/**
 * Reset stuck syncing items
 *
 * If items are stuck in 'syncing' status (e.g., app crashed), reset them to pending.
 *
 * @param olderThanMinutes Reset items stuck for more than X minutes
 * @returns Promise<number> Number of items reset
 */
export const resetStuckSyncingItems = async (olderThanMinutes = 10): Promise<number> => {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - (olderThanMinutes * 60);

  const result = await executeNonQuery(
    `UPDATE sync_queue
     SET status = 'pending'
     WHERE status = 'syncing'
       AND last_attempt_at < ?;`,
    [cutoffTimestamp]
  );

  if (result.changes > 0) {
    console.log(`[Sync] Reset ${result.changes} stuck syncing items`);
  }

  return result.changes;
};

/**
 * Clear all sync queue items
 *
 * WARNING: This is a destructive operation. Use only for development or explicit user action.
 *
 * @returns Promise<void>
 */
export const clearSyncQueue = async (): Promise<void> => {
  await executeNonQuery('DELETE FROM sync_queue;', []);
  await executeNonQuery('DELETE FROM cloud_sync_state;', []);

  console.log('[Sync] Cleared all sync queue items');
};

/**
 * Check if entity has pending sync operations
 *
 * @param entityType Entity type
 * @param entityId Entity ID
 * @returns Promise<boolean>
 */
export const hasPendingSyncForEntity = async (
  entityType: SyncEntityType,
  entityId: string
): Promise<boolean> => {
  const result = await executeQueryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue
     WHERE entity_type = ?
       AND entity_id = ?
       AND status IN ('pending', 'failed', 'syncing');`,
    [entityType, entityId]
  );

  return result ? result.count > 0 : false;
};

/**
 * Get retry delay for failed sync item (exponential backoff)
 *
 * Based on CLAUDE.md: "Exponential backoff for retries"
 *
 * @param retryCount Current retry count
 * @returns Delay in milliseconds
 */
export const getRetryDelay = (retryCount: number): number => {
  // Base delay: 5 seconds
  // Multiplier: 2^retryCount
  // Max delay: 5 minutes
  const baseDelay = 5000; // 5 seconds
  const delay = baseDelay * Math.pow(2, retryCount);
  const maxDelay = 300000; // 5 minutes

  return Math.min(delay, maxDelay);
};
