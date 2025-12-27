/**
 * Database schema definitions for CleanSpace
 *
 * This module contains all table creation SQL statements and indexes.
 * Based on CLAUDE.md specifications for the hybrid SQLite + Supabase architecture.
 *
 * Critical Tables:
 * - photos: Master registry of all photos
 * - photo_hashes: Multiple hash types for duplicate detection
 * - duplicate_groups: Organized duplicate collections
 * - photo_duplicate_mapping: Many-to-many photo-to-group relationships
 * - usage_limits: Freemium tier enforcement
 * - user_preferences: App settings
 * - scan_history: Audit trail of scans
 * - sync_queue: Pending cloud sync operations
 */

import { executeRawSQL, executeTransaction, getDatabase } from './init';

/**
 * Main photos table - Master registry
 *
 * Stores metadata for all photos in the device library.
 * Does NOT store actual photo data, only references and metadata.
 */
const CREATE_PHOTOS_TABLE = `
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  creation_time INTEGER,
  modification_time INTEGER,
  media_type TEXT DEFAULT 'photo',
  is_screenshot INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  album_id TEXT,
  location_latitude REAL,
  location_longitude REAL,
  exif_data TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`;

/**
 * Photo hashes table - Multiple hash types for duplicate detection
 *
 * Stores different hash types:
 * - md5_hash: Exact duplicate detection (file content hash)
 * - perceptual_hash: Visual similarity detection
 * - dhash: Difference hash for rotations
 * - average_hash: Basic similarity detection
 */
const CREATE_PHOTO_HASHES_TABLE = `
CREATE TABLE IF NOT EXISTS photo_hashes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id TEXT NOT NULL,
  md5_hash TEXT,
  perceptual_hash TEXT,
  dhash TEXT,
  average_hash TEXT,
  hash_generated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
);
`;

/**
 * Duplicate groups table
 *
 * Organizes detected duplicates into groups with confidence scores.
 * Types: 'exact', 'similar', 'burst', 'screenshot'
 */
const CREATE_DUPLICATE_GROUPS_TABLE = `
CREATE TABLE IF NOT EXISTS duplicate_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_type TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  total_size INTEGER,
  potential_savings INTEGER,
  photo_count INTEGER DEFAULT 0,
  is_resolved INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  resolved_at INTEGER
);
`;

/**
 * Photo-to-duplicate-group mapping table (many-to-many)
 *
 * Links photos to duplicate groups.
 * is_primary flag indicates the recommended photo to keep.
 */
const CREATE_PHOTO_DUPLICATE_MAPPING_TABLE = `
CREATE TABLE IF NOT EXISTS photo_duplicate_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id TEXT NOT NULL,
  group_id INTEGER NOT NULL,
  is_primary INTEGER DEFAULT 0,
  quality_score REAL,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES duplicate_groups(id) ON DELETE CASCADE,
  UNIQUE(photo_id, group_id)
);
`;

/**
 * Videos table
 *
 * Similar to photos but for video files.
 */
const CREATE_VIDEOS_TABLE = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  creation_time INTEGER,
  modification_time INTEGER,
  is_deleted INTEGER DEFAULT 0,
  album_id TEXT,
  location_latitude REAL,
  location_longitude REAL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`;

/**
 * Scan history table
 *
 * Audit trail of all photo library scans.
 * Tracks scan type, duration, and results.
 */
const CREATE_SCAN_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS scan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_type TEXT NOT NULL,
  photos_scanned INTEGER DEFAULT 0,
  duplicates_found INTEGER DEFAULT 0,
  large_files_found INTEGER DEFAULT 0,
  screenshots_found INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  status TEXT DEFAULT 'pending',
  error_message TEXT
);
`;

/**
 * Storage analytics table
 *
 * Periodic snapshots of storage usage for trends and charts.
 */
const CREATE_STORAGE_ANALYTICS_TABLE = `
CREATE TABLE IF NOT EXISTS storage_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_photos INTEGER DEFAULT 0,
  total_videos INTEGER DEFAULT 0,
  total_size INTEGER DEFAULT 0,
  photos_size INTEGER DEFAULT 0,
  videos_size INTEGER DEFAULT 0,
  screenshots_size INTEGER DEFAULT 0,
  duplicates_size INTEGER DEFAULT 0,
  space_saved INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`;

/**
 * User preferences table
 *
 * App settings and feature toggles.
 * Stored as key-value pairs for flexibility.
 */
const CREATE_USER_PREFERENCES_TABLE = `
CREATE TABLE IF NOT EXISTS user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT DEFAULT 'string',
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`;

/**
 * Sync queue table
 *
 * Local changes awaiting cloud sync.
 * Never blocks local operations - all sync happens in background.
 */
const CREATE_SYNC_QUEUE_TABLE = `
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_attempt_at INTEGER,
  synced_at INTEGER
);
`;

/**
 * Cloud sync state table
 *
 * Tracks overall sync status and last sync timestamps.
 */
const CREATE_CLOUD_SYNC_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS cloud_sync_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL UNIQUE,
  last_sync_at INTEGER,
  last_sync_status TEXT,
  pending_operations INTEGER DEFAULT 0
);
`;

/**
 * Usage limits table
 *
 * Freemium tier enforcement.
 * Tracks scans and cleanups performed in current period.
 */
const CREATE_USAGE_LIMITS_TABLE = `
CREATE TABLE IF NOT EXISTS usage_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_tier TEXT DEFAULT 'free',
  scans_performed INTEGER DEFAULT 0,
  scans_limit INTEGER DEFAULT 3,
  duplicates_cleaned INTEGER DEFAULT 0,
  duplicates_limit INTEGER DEFAULT 50,
  period_start_date INTEGER DEFAULT (strftime('%s', 'now')),
  period_end_date INTEGER,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
`;

/**
 * Indexes for optimized queries
 *
 * Based on CLAUDE.md requirements for common query patterns.
 */
const CREATE_INDEXES = [
  // Photos table indexes
  'CREATE INDEX IF NOT EXISTS idx_photos_file_size ON photos(file_size);',
  'CREATE INDEX IF NOT EXISTS idx_photos_is_screenshot ON photos(is_screenshot);',
  'CREATE INDEX IF NOT EXISTS idx_photos_is_deleted ON photos(is_deleted);',
  'CREATE INDEX IF NOT EXISTS idx_photos_creation_time ON photos(creation_time);',
  'CREATE INDEX IF NOT EXISTS idx_photos_media_type ON photos(media_type);',

  // Photo hashes indexes
  'CREATE INDEX IF NOT EXISTS idx_photo_hashes_photo_id ON photo_hashes(photo_id);',
  'CREATE INDEX IF NOT EXISTS idx_photo_hashes_md5 ON photo_hashes(md5_hash);',
  'CREATE INDEX IF NOT EXISTS idx_photo_hashes_perceptual ON photo_hashes(perceptual_hash);',

  // Duplicate groups indexes
  'CREATE INDEX IF NOT EXISTS idx_duplicate_groups_type ON duplicate_groups(group_type);',
  'CREATE INDEX IF NOT EXISTS idx_duplicate_groups_resolved ON duplicate_groups(is_resolved);',

  // Mapping table indexes
  'CREATE INDEX IF NOT EXISTS idx_photo_dup_mapping_photo ON photo_duplicate_mapping(photo_id);',
  'CREATE INDEX IF NOT EXISTS idx_photo_dup_mapping_group ON photo_duplicate_mapping(group_id);',

  // Scan history indexes
  'CREATE INDEX IF NOT EXISTS idx_scan_history_created ON scan_history(created_at);',
  'CREATE INDEX IF NOT EXISTS idx_scan_history_status ON scan_history(status);',

  // Sync queue indexes
  'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);',
  'CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);',
];

/**
 * Initialize default user preferences
 *
 * Sets up default app settings on first run.
 */
const INSERT_DEFAULT_PREFERENCES = [
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('auto_scan_enabled', 'false', 'boolean');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('scan_frequency', 'weekly', 'string');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('scan_only_charging', 'true', 'boolean');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('similarity_threshold', '0.85', 'number');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('include_screenshots', 'true', 'boolean');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('include_burst_photos', 'true', 'boolean');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('cloud_sync_enabled', 'false', 'boolean');",
  "INSERT OR IGNORE INTO user_preferences (key, value, value_type) VALUES ('theme', 'light', 'string');",
];

/**
 * Initialize default usage limits for free tier
 */
const INSERT_DEFAULT_USAGE_LIMITS = `
INSERT OR IGNORE INTO usage_limits (id, user_tier, scans_limit, duplicates_limit)
VALUES (1, 'free', 3, 50);
`;

/**
 * Create all database tables and indexes
 *
 * This function is called during app initialization to set up the schema.
 *
 * @returns Promise<void>
 */
export const createSchema = async (): Promise<void> => {
  try {
    console.log('[Schema] Creating database schema...');

    const db = getDatabase();

    // Execute all operations in a single transaction
    await executeTransaction(async (_txn) => {
      // Create tables
      await db.execAsync(CREATE_PHOTOS_TABLE);
      await db.execAsync(CREATE_PHOTO_HASHES_TABLE);
      await db.execAsync(CREATE_DUPLICATE_GROUPS_TABLE);
      await db.execAsync(CREATE_PHOTO_DUPLICATE_MAPPING_TABLE);
      await db.execAsync(CREATE_VIDEOS_TABLE);
      await db.execAsync(CREATE_SCAN_HISTORY_TABLE);
      await db.execAsync(CREATE_STORAGE_ANALYTICS_TABLE);
      await db.execAsync(CREATE_USER_PREFERENCES_TABLE);
      await db.execAsync(CREATE_SYNC_QUEUE_TABLE);
      await db.execAsync(CREATE_CLOUD_SYNC_STATE_TABLE);
      await db.execAsync(CREATE_USAGE_LIMITS_TABLE);

      // Create indexes
      for (const indexSQL of CREATE_INDEXES) {
        await db.execAsync(indexSQL);
      }

      // Insert default preferences
      for (const prefSQL of INSERT_DEFAULT_PREFERENCES) {
        await db.execAsync(prefSQL);
      }

      // Insert default usage limits
      await db.execAsync(INSERT_DEFAULT_USAGE_LIMITS);
    });

    console.log('[Schema] Database schema created successfully');
  } catch (error) {
    console.error('[Schema] Error creating schema:', error);
    throw new Error(`Schema creation failed: ${error}`);
  }
};

/**
 * Drop all tables (use with caution!)
 *
 * This is primarily for development and testing.
 * In production, use migrations instead.
 */
export const dropAllTables = async (): Promise<void> => {
  const tables = [
    'photos',
    'photo_hashes',
    'duplicate_groups',
    'photo_duplicate_mapping',
    'videos',
    'scan_history',
    'storage_analytics',
    'user_preferences',
    'sync_queue',
    'cloud_sync_state',
    'usage_limits',
  ];

  const db = getDatabase();

  await executeTransaction(async (_txn) => {
    for (const table of tables) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table};`);
    }
  });

  console.log('[Schema] All tables dropped');
};
