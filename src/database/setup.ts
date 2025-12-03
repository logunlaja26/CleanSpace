/**
 * Database setup and initialization
 *
 * This module handles the complete database initialization process:
 * 1. Initialize database connection
 * 2. Run migrations
 * 3. Verify setup
 * 4. Seed default data if needed
 *
 * Call this on app startup.
 */

import { initializeDatabase } from './init';
import { runMigrations, getCurrentVersion, CURRENT_SCHEMA_VERSION } from './migrations';
import { initializeUsageLimits } from './queries/usage';

/**
 * Setup result
 */
export interface DatabaseSetupResult {
  success: boolean;
  version: number;
  message: string;
  error?: Error;
}

/**
 * Initialize the database
 *
 * This is the main entry point for database setup.
 * Call this when your app starts.
 *
 * @returns Promise<DatabaseSetupResult>
 */
export const setupDatabase = async (): Promise<DatabaseSetupResult> => {
  try {
    console.log('[Database Setup] Starting database initialization...');

    // Step 1: Initialize database connection
    console.log('[Database Setup] Step 1/3: Opening database connection...');
    await initializeDatabase();
    console.log('[Database Setup] ✓ Database connection established');

    // Step 2: Run migrations
    console.log('[Database Setup] Step 2/3: Running migrations...');
    await runMigrations();
    const version = await getCurrentVersion();
    console.log(`[Database Setup] ✓ Migrations complete (version ${version})`);

    // Step 3: Initialize usage limits if needed
    console.log('[Database Setup] Step 3/3: Initializing usage limits...');
    await initializeUsageLimits();
    console.log('[Database Setup] ✓ Usage limits initialized');

    // Verify setup
    const verificationResult = await verifyDatabaseSetup();
    if (!verificationResult.success) {
      throw new Error(`Database verification failed: ${verificationResult.message}`);
    }

    console.log('[Database Setup] ✅ Database setup complete!');
    console.log(`[Database Setup] Schema version: ${version}/${CURRENT_SCHEMA_VERSION}`);

    return {
      success: true,
      version,
      message: 'Database initialized successfully',
    };
  } catch (error) {
    console.error('[Database Setup] ❌ Database setup failed:', error);

    return {
      success: false,
      version: 0,
      message: `Database setup failed: ${error}`,
      error: error as Error,
    };
  }
};

/**
 * Verify database setup
 *
 * Checks that all required tables exist and are accessible.
 *
 * @returns Promise<DatabaseSetupResult>
 */
export const verifyDatabaseSetup = async (): Promise<DatabaseSetupResult> => {
  try {
    const { executeQuery } = await import('./init');

    // Check that key tables exist
    const requiredTables = [
      'photos',
      'photo_hashes',
      'duplicate_groups',
      'photo_duplicate_mapping',
      'user_preferences',
      'usage_limits',
      'scan_history',
      'sync_queue',
    ];

    for (const table of requiredTables) {
      const result = await executeQuery<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?;",
        [table]
      );

      if (result.length === 0) {
        throw new Error(`Required table '${table}' does not exist`);
      }
    }

    // Verify we can query tables
    const photosCount = await executeQuery('SELECT COUNT(*) as count FROM photos;', []);
    const prefsCount = await executeQuery('SELECT COUNT(*) as count FROM user_preferences;', []);
    const usageCount = await executeQuery('SELECT COUNT(*) as count FROM usage_limits;', []);

    console.log('[Database Setup] Verification checks passed:');
    console.log(`  - All ${requiredTables.length} required tables exist`);
    console.log(`  - Photos: ${photosCount[0]?.count || 0}`);
    console.log(`  - Preferences: ${prefsCount[0]?.count || 0}`);
    console.log(`  - Usage limits initialized: ${usageCount[0]?.count > 0 ? 'Yes' : 'No'}`);

    return {
      success: true,
      version: await getCurrentVersion(),
      message: 'Database verification passed',
    };
  } catch (error) {
    console.error('[Database Setup] Verification failed:', error);

    return {
      success: false,
      version: 0,
      message: `Verification failed: ${error}`,
      error: error as Error,
    };
  }
};

/**
 * Reset database and reinitialize (development only)
 *
 * WARNING: This deletes all data!
 *
 * @returns Promise<DatabaseSetupResult>
 */
export const resetAndReinitializeDatabase = async (): Promise<DatabaseSetupResult> => {
  try {
    console.log('[Database Setup] ⚠️  Resetting database...');

    const { resetDatabase } = await import('./migrations');
    await resetDatabase();

    console.log('[Database Setup] ✓ Database reset complete');

    // Re-initialize
    return await setupDatabase();
  } catch (error) {
    console.error('[Database Setup] Reset failed:', error);

    return {
      success: false,
      version: 0,
      message: `Database reset failed: ${error}`,
      error: error as Error,
    };
  }
};

/**
 * Get database statistics
 *
 * Useful for debugging and monitoring.
 *
 * @returns Promise with database stats
 */
export const getDatabaseStatistics = async () => {
  try {
    const { executeQuery } = await import('./init');
    const { getCurrentVersion } = await import('./migrations');

    // Get table sizes
    const tables = await executeQuery<{ name: string; count: number }>(
      `SELECT
        name,
        (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=m.name) as count
       FROM sqlite_master m
       WHERE type='table'
       ORDER BY name;`,
      []
    );

    // Get schema version
    const version = await getCurrentVersion();

    // Get database file size (approximation)
    const pageCount = await executeQuery<{ page_count: number }>('PRAGMA page_count;', []);
    const pageSize = await executeQuery<{ page_size: number }>('PRAGMA page_size;', []);

    const dbSizeBytes = (pageCount[0]?.page_count || 0) * (pageSize[0]?.page_size || 0);
    const dbSizeMB = (dbSizeBytes / 1024 / 1024).toFixed(2);

    return {
      schemaVersion: version,
      tables: tables.map((t) => t.name),
      tableCount: tables.length,
      databaseSizeMB: parseFloat(dbSizeMB),
      journalMode: await executeQuery('PRAGMA journal_mode;', []),
      synchronous: await executeQuery('PRAGMA synchronous;', []),
    };
  } catch (error) {
    console.error('[Database Setup] Failed to get statistics:', error);
    return null;
  }
};
