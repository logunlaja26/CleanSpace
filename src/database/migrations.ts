/**
 * Database migrations module for CleanSpace
 *
 * This module handles schema versioning and migrations.
 * Each migration represents a change to the database schema.
 *
 * How migrations work:
 * 1. On app startup, check current schema version
 * 2. Run all pending migrations in order
 * 3. Update schema version after each migration
 *
 * Migration naming convention: v{number}_{description}
 * Example: v1_initial_schema, v2_add_quality_scores
 */

import { executeTransaction, executeQueryFirst, getDatabase } from './init';
import { createSchema } from './schema';

// Current schema version
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migration interface
 */
interface Migration {
  version: number;
  name: string;
  up: (db: any) => Promise<void>;
  down?: (db: any) => Promise<void>; // Optional rollback function
}

/**
 * Get current database schema version
 *
 * @returns Promise<number>
 */
export const getCurrentVersion = async (): Promise<number> => {
  try {
    // Check if schema_version table exists
    const result = await executeQueryFirst<{ count: number }>(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='schema_version';",
      []
    );

    if (result && result.count === 0) {
      // Schema version table doesn't exist, this is a fresh install
      return 0;
    }

    // Get current version
    const versionResult = await executeQueryFirst<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1;',
      []
    );

    return versionResult ? versionResult.version : 0;
  } catch (error) {
    console.error('[Migrations] Error getting current version:', error);
    return 0;
  }
};

/**
 * Set database schema version
 *
 * @param version Version number
 * @returns Promise<void>
 */
const setVersion = async (version: number): Promise<void> => {
  const db = getDatabase();

  await executeTransaction(async (txn) => {
    // Create schema_version table if it doesn't exist
    await txn.execAsync(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Insert new version
    await txn.runAsync(
      'INSERT OR REPLACE INTO schema_version (version) VALUES (?);',
      [version]
    );
  });

  console.log(`[Migrations] Schema version set to ${version}`);
};

/**
 * Migration v1: Initial schema
 */
const migration_v1: Migration = {
  version: 1,
  name: 'initial_schema',
  up: async (db) => {
    console.log('[Migrations] Running migration v1: Initial schema');
    await createSchema();
  },
  down: async (db) => {
    console.log('[Migrations] Rolling back migration v1');
    // Drop all tables (handled by schema.ts)
  },
};

/**
 * All migrations in order
 *
 * IMPORTANT: Migrations must be added in order and never modified once deployed.
 * Always add new migrations at the end of this array.
 */
const migrations: Migration[] = [
  migration_v1,
  // Future migrations will be added here
  // migration_v2,
  // migration_v3,
  // etc.
];

/**
 * Run all pending migrations
 *
 * This function:
 * 1. Gets current schema version
 * 2. Filters migrations that haven't been run
 * 3. Runs each migration in order
 * 4. Updates schema version after each successful migration
 *
 * @returns Promise<void>
 */
export const runMigrations = async (): Promise<void> => {
  try {
    console.log('[Migrations] Checking for pending migrations...');

    const currentVersion = await getCurrentVersion();
    console.log(`[Migrations] Current schema version: ${currentVersion}`);

    // Get pending migrations
    const pendingMigrations = migrations.filter(
      (migration) => migration.version > currentVersion
    );

    if (pendingMigrations.length === 0) {
      console.log('[Migrations] No pending migrations');
      return;
    }

    console.log(`[Migrations] Found ${pendingMigrations.length} pending migration(s)`);

    // Run each migration
    for (const migration of pendingMigrations) {
      try {
        console.log(`[Migrations] Running migration ${migration.version}: ${migration.name}`);

        const db = getDatabase();
        await migration.up(db);

        // Update schema version
        await setVersion(migration.version);

        console.log(`[Migrations] Migration ${migration.version} completed successfully`);
      } catch (error) {
        console.error(`[Migrations] Migration ${migration.version} failed:`, error);
        throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${error}`);
      }
    }

    console.log('[Migrations] All migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Migration process failed:', error);
    throw error;
  }
};

/**
 * Rollback to a specific version (use with caution!)
 *
 * This function rolls back migrations down to the specified version.
 * Only available in development.
 *
 * @param targetVersion Version to rollback to
 * @returns Promise<void>
 */
export const rollbackTo = async (targetVersion: number): Promise<void> => {
  try {
    console.log(`[Migrations] Rolling back to version ${targetVersion}`);

    const currentVersion = await getCurrentVersion();

    if (targetVersion >= currentVersion) {
      console.log('[Migrations] Nothing to rollback');
      return;
    }

    // Get migrations to rollback (in reverse order)
    const migrationsToRollback = migrations
      .filter(
        (migration) =>
          migration.version > targetVersion && migration.version <= currentVersion
      )
      .reverse();

    for (const migration of migrationsToRollback) {
      if (!migration.down) {
        console.warn(
          `[Migrations] Migration ${migration.version} does not have a rollback function`
        );
        continue;
      }

      try {
        console.log(`[Migrations] Rolling back migration ${migration.version}: ${migration.name}`);

        const db = getDatabase();
        await migration.down(db);

        console.log(`[Migrations] Migration ${migration.version} rolled back successfully`);
      } catch (error) {
        console.error(`[Migrations] Rollback of migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    // Update schema version
    await setVersion(targetVersion);

    console.log(`[Migrations] Successfully rolled back to version ${targetVersion}`);
  } catch (error) {
    console.error('[Migrations] Rollback process failed:', error);
    throw error;
  }
};

/**
 * Reset database (drop all tables and re-run migrations)
 *
 * This is a destructive operation. All data will be lost!
 * Only use in development or for user-initiated database reset.
 *
 * @returns Promise<void>
 */
export const resetDatabase = async (): Promise<void> => {
  try {
    console.log('[Migrations] Resetting database...');

    const db = getDatabase();

    // Drop all tables
    await executeTransaction(async (txn) => {
      // Drop schema_version table
      await txn.execAsync('DROP TABLE IF EXISTS schema_version;');

      // Drop all app tables
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

      for (const table of tables) {
        await txn.execAsync(`DROP TABLE IF EXISTS ${table};`);
      }
    });

    console.log('[Migrations] All tables dropped');

    // Re-run all migrations
    await runMigrations();

    console.log('[Migrations] Database reset complete');
  } catch (error) {
    console.error('[Migrations] Database reset failed:', error);
    throw error;
  }
};

/**
 * Example of how to add a new migration:
 *
 * const migration_v2: Migration = {
 *   version: 2,
 *   name: 'add_quality_scores',
 *   up: async (db) => {
 *     await db.execAsync(`
 *       ALTER TABLE photo_duplicate_mapping
 *       ADD COLUMN quality_score REAL;
 *     `);
 *   },
 *   down: async (db) => {
 *     // SQLite doesn't support DROP COLUMN easily
 *     // May need to recreate table or accept this column stays
 *   },
 * };
 *
 * Then add migration_v2 to the migrations array above.
 */
