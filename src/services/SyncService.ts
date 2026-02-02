/**
 * SyncService
 *
 * Manages cloud synchronization with Supabase.
 *
 * Based on CLAUDE.md architecture:
 * - Never blocks local operations
 * - Processes sync_queue in background
 * - Batch API requests (50-100 items)
 * - Exponential backoff for retries
 * - User must explicitly opt-in to cloud sync
 *
 * What gets synced:
 * - Preferences (user settings)
 * - Duplicate decisions (which photos user chose to keep/delete)
 * - Analytics summaries (aggregate statistics, not individual photos)
 * - Photo hashes (MD5, perceptual) for cross-device duplicate detection
 *
 * What NEVER gets synced:
 * - Actual photo files
 * - Full file URIs
 * - Sensitive personal data
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SyncEntityType,
  SyncOperationType,
  enqueueSyncItem,
  getPendingSyncItems,
  markSyncItemSyncing,
  markSyncItemComplete,
  markSyncItemFailed,
  updateSyncState,
  getPendingSyncItemsCount,
  resetStuckSyncingItems,
  getRetryDelay,
  getSyncState,
} from '../database/queries/sync';
import { getPreference, setPreference } from '../database/queries/preferences';

/**
 * Sync configuration
 */
interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  batchSize: number;
  retryDelay: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  duration: number;
  error?: string;
}

/**
 * Sync progress callback
 */
export type SyncProgressCallback = (progress: {
  current: number;
  total: number;
  percentage: number;
  entityType?: SyncEntityType;
}) => void;

/**
 * SyncService class
 *
 * Handles background synchronization of data to Supabase.
 */
export class SyncService {
  private supabase: SupabaseClient | null = null;
  private isInitialized: boolean = false;
  private isSyncing: boolean = false;
  private syncEnabled: boolean = false;

  // Configuration
  private readonly SUPABASE_URL = 'https://your-project.supabase.co'; // TODO: Replace with actual URL
  private readonly SUPABASE_ANON_KEY = 'your-anon-key'; // TODO: Replace with actual key
  private readonly BATCH_SIZE = 50;

  /**
   * Initialize Supabase client
   *
   * Call this during app startup.
   *
   * @returns Promise<void>
   * @example
   * await syncService.initialize();
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[SyncService] Already initialized');
      return;
    }

    try {
      // Create Supabase client
      this.supabase = createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
        },
      });

      // Check if sync is enabled
      this.syncEnabled = await this.isSyncEnabled();

      // Reset any stuck syncing items
      await resetStuckSyncingItems();

      this.isInitialized = true;

      console.log('[SyncService] Initialized successfully');
    } catch (error) {
      console.error('[SyncService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start sync process
   *
   * Processes pending items in sync queue and syncs to Supabase.
   * This runs in the background and doesn't block the UI.
   *
   * @param onProgress Optional progress callback
   * @returns Promise<SyncResult>
   * @example
   * const result = await syncService.startSync((progress) => {
   *   console.log(`Syncing: ${progress.percentage}%`);
   * });
   */
  async startSync(onProgress?: SyncProgressCallback): Promise<SyncResult> {
    if (!this.isInitialized || !this.supabase) {
      return {
        success: false,
        itemsSynced: 0,
        itemsFailed: 0,
        duration: 0,
        error: 'SyncService not initialized',
      };
    }

    if (!this.syncEnabled) {
      console.log('[SyncService] Sync is disabled by user');
      return {
        success: true,
        itemsSynced: 0,
        itemsFailed: 0,
        duration: 0,
      };
    }

    if (this.isSyncing) {
      console.warn('[SyncService] Sync already in progress');
      return {
        success: false,
        itemsSynced: 0,
        itemsFailed: 0,
        duration: 0,
        error: 'Sync already in progress',
      };
    }

    this.isSyncing = true;

    const startTime = Date.now();
    let itemsSynced = 0;
    let itemsFailed = 0;

    try {
      // Get total pending items
      const totalPending = await getPendingSyncItemsCount();

      if (totalPending === 0) {
        console.log('[SyncService] No items to sync');
        return {
          success: true,
          itemsSynced: 0,
          itemsFailed: 0,
          duration: Date.now() - startTime,
        };
      }

      // Process in batches
      let hasMore = true;

      while (hasMore) {
        // Get batch of pending items
        const items = await getPendingSyncItems(this.BATCH_SIZE);

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        // Process each item
        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          try {
            // Mark as syncing
            await markSyncItemSyncing(item.id);

            // Sync the item
            await this.syncItem(item);

            // Mark as complete
            await markSyncItemComplete(item.id);

            itemsSynced++;

            // Update progress
            onProgress?.({
              current: itemsSynced,
              total: totalPending,
              percentage: Math.round((itemsSynced / totalPending) * 100),
              entityType: item.entity_type,
            });
          } catch (error) {
            // Mark as failed
            const errorMessage = error instanceof Error ? error.message : String(error);
            await markSyncItemFailed(item.id, errorMessage);

            itemsFailed++;

            console.error(`[SyncService] Failed to sync item ${item.id}:`, error);
          }
        }

        // Check if there are more items
        hasMore = items.length === this.BATCH_SIZE;
      }

      // Update sync state
      await this.updateAllSyncStates('success');

      return {
        success: true,
        itemsSynced,
        itemsFailed,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[SyncService] Sync failed:', error);

      await this.updateAllSyncStates('failed');

      return {
        success: false,
        itemsSynced,
        itemsFailed,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync preferences to cloud
   *
   * @param key Preference key
   * @param value Preference value
   * @returns Promise<void>
   */
  async syncPreference(key: string, value: string): Promise<void> {
    await enqueueSyncItem({
      operation_type: 'update',
      entity_type: 'preference',
      entity_id: key,
      payload: JSON.stringify({ key, value }),
      max_retries: 3,
    });
  }

  /**
   * Sync duplicate decision to cloud
   *
   * @param groupId Duplicate group ID
   * @param decision User's decision (which photo to keep)
   * @returns Promise<void>
   */
  async syncDuplicateDecision(groupId: number, decision: any): Promise<void> {
    await enqueueSyncItem({
      operation_type: 'create',
      entity_type: 'duplicate_decision',
      entity_id: String(groupId),
      payload: JSON.stringify(decision),
      max_retries: 3,
    });
  }

  /**
   * Sync analytics summary to cloud
   *
   * @param summary Analytics summary data
   * @returns Promise<void>
   */
  async syncAnalyticsSummary(summary: any): Promise<void> {
    await enqueueSyncItem({
      operation_type: 'create',
      entity_type: 'analytics_summary',
      entity_id: String(Date.now()),
      payload: JSON.stringify(summary),
      max_retries: 3,
    });
  }

  /**
   * Sync photo hash to cloud
   *
   * @param photoId Photo ID
   * @param hash Hash data
   * @returns Promise<void>
   */
  async syncPhotoHash(photoId: string, hash: any): Promise<void> {
    await enqueueSyncItem({
      operation_type: 'create',
      entity_type: 'photo_hash',
      entity_id: photoId,
      payload: JSON.stringify(hash),
      max_retries: 3,
    });
  }

  /**
   * Check if cloud sync is enabled
   *
   * @returns Promise<boolean>
   */
  async isSyncEnabled(): Promise<boolean> {
    const enabled = await getPreference('cloud_sync_enabled');
    return enabled === '1' || enabled === 'true' || enabled === true;
  }

  /**
   * Enable cloud sync
   *
   * @returns Promise<void>
   */
  async enableSync(): Promise<void> {
    await setPreference('cloud_sync_enabled', '1');
    this.syncEnabled = true;
    console.log('[SyncService] Cloud sync enabled');
  }

  /**
   * Disable cloud sync
   *
   * @returns Promise<void>
   */
  async disableSync(): Promise<void> {
    await setPreference('cloud_sync_enabled', '0');
    this.syncEnabled = false;
    console.log('[SyncService] Cloud sync disabled');
  }

  /**
   * Get sync status for an entity type
   *
   * @param entityType Entity type
   * @returns Promise with sync status
   */
  async getSyncStatus(entityType: SyncEntityType) {
    return await getSyncState(entityType);
  }

  /**
   * Get total pending sync items count
   *
   * @returns Promise<number>
   */
  async getPendingCount(): Promise<number> {
    return await getPendingSyncItemsCount();
  }

  /**
   * Check if sync is currently in progress
   *
   * @returns boolean
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  /**
   * Sync a single item to Supabase
   *
   * @param item Sync queue item
   * @returns Promise<void>
   */
  private async syncItem(item: any): Promise<void> {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }

    const payload = item.payload ? JSON.parse(item.payload) : {};

    // Map entity type to Supabase table
    const tableName = this.getTableName(item.entity_type);

    // Perform the operation
    switch (item.operation_type) {
      case 'create':
        await this.supabase.from(tableName).insert(payload);
        break;

      case 'update':
        await this.supabase.from(tableName).update(payload).eq('id', item.entity_id);
        break;

      case 'delete':
        await this.supabase.from(tableName).delete().eq('id', item.entity_id);
        break;

      default:
        throw new Error(`Unknown operation type: ${item.operation_type}`);
    }
  }

  /**
   * Get Supabase table name for entity type
   *
   * @param entityType Entity type
   * @returns string Table name
   */
  private getTableName(entityType: SyncEntityType): string {
    const tableMap: Record<SyncEntityType, string> = {
      preference: 'user_preferences',
      duplicate_decision: 'duplicate_decisions',
      analytics_summary: 'analytics_summaries',
      photo_hash: 'photo_hashes',
    };

    return tableMap[entityType] || entityType;
  }

  /**
   * Update sync states for all entity types
   *
   * @param status Sync status
   * @returns Promise<void>
   */
  private async updateAllSyncStates(status: 'success' | 'failed'): Promise<void> {
    const entityTypes: SyncEntityType[] = [
      'preference',
      'duplicate_decision',
      'analytics_summary',
      'photo_hash',
    ];

    for (const entityType of entityTypes) {
      await updateSyncState(entityType, status);
    }
  }
}

// Export singleton instance
export const syncService = new SyncService();
