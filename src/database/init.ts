import * as SQLite from 'expo-sqlite';

/**
 * Database initialization module for CleanSpace
 *
 * This module handles:
 * - Opening the SQLite database connection
 * - Applying performance PRAGMAs for optimal query performance
 * - Creating database schema on first run
 * - Running migrations
 *
 * Critical Architecture Principle: SQLite is the source of truth
 * - All operations must be fast (<100ms query response time)
 * - WAL mode for concurrent reads/writes
 * - Proper indexing for common queries
 */

// Database instance (singleton)
let dbInstance: SQLite.SQLiteDatabase | null = null;

// Database configuration
const DB_NAME = 'cleanspace.db';

/**
 * Apply performance PRAGMAs to optimize database operations
 *
 * Based on CLAUDE.md requirements:
 * - WAL mode: Allows concurrent reads while writing
 * - NORMAL synchronous: Balance between safety and speed
 * - Large cache: Improves query performance
 * - Memory temp store: Faster temporary operations
 * - Memory-mapped I/O: Improved read performance
 */
const applyPragmas = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    // Apply all PRAGMAs in a single execution
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = 10000;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
    `);

    console.log('[Database] Performance PRAGMAs applied successfully');
  } catch (error) {
    console.error('[Database] Error applying PRAGMAs:', error);
    throw error;
  }
};

/**
 * Initialize the database
 *
 * This function:
 * 1. Opens the database connection
 * 2. Applies performance PRAGMAs
 * 3. Creates schema if needed
 * 4. Runs migrations
 *
 * @returns Promise<SQLite.SQLiteDatabase>
 */
export const initializeDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  try {
    console.log('[Database] Initializing database...');

    // Open database (creates if doesn't exist)
    const db = await SQLite.openDatabaseAsync(DB_NAME);

    // Apply performance PRAGMAs
    await applyPragmas(db);

    // Note: Schema creation and migrations will be handled separately
    // by importing and running schema.ts and migrations.ts

    console.log('[Database] Database initialized successfully');
    dbInstance = db;

    return db;
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error);
    throw new Error(`Database initialization failed: ${error}`);
  }
};

/**
 * Get the database instance
 *
 * @returns SQLite.SQLiteDatabase
 * @throws Error if database not initialized
 */
export const getDatabase = (): SQLite.SQLiteDatabase => {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
};

/**
 * Execute a SQL query and return all results
 *
 * @param sql SQL query string
 * @param params Query parameters
 * @returns Promise with query results
 */
export const executeQuery = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> => {
  const db = getDatabase();

  try {
    const results = await db.getAllAsync<T>(sql, params);
    return results;
  } catch (error) {
    console.error('[Database] Query error:', error);
    throw error;
  }
};

/**
 * Execute a SQL query and return the first result
 *
 * @param sql SQL query string
 * @param params Query parameters
 * @returns Promise with first result or null
 */
export const executeQueryFirst = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> => {
  const db = getDatabase();

  try {
    const result = await db.getFirstAsync<T>(sql, params);
    return result;
  } catch (error) {
    console.error('[Database] Query error:', error);
    throw error;
  }
};

/**
 * Execute a SQL query without returning results (INSERT, UPDATE, DELETE)
 *
 * @param sql SQL query string
 * @param params Query parameters
 * @returns Promise<SQLite.SQLiteRunResult>
 */
export const executeNonQuery = async (
  sql: string,
  params: any[] = []
): Promise<SQLite.SQLiteRunResult> => {
  const db = getDatabase();

  try {
    const result = await db.runAsync(sql, params);
    return result;
  } catch (error) {
    console.error('[Database] Query error:', error);
    throw error;
  }
};

/**
 * Execute multiple SQL statements in a single transaction
 * Useful for batch operations (100+ rows as per CLAUDE.md)
 *
 * @param callback Function that performs database operations
 * @returns Promise<void>
 */
export const executeTransaction = async (
  callback: (db: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> => {
  const db = getDatabase();

  try {
    await db.withTransactionAsync(async () => {
      await callback(db);
    });
  } catch (error) {
    console.error('[Database] Transaction error:', error);
    throw error;
  }
};

/**
 * Execute multiple SQL statements in a single exclusive transaction
 * Use this when you need to ensure no other operations can interfere
 *
 * @param callback Function that performs database operations on the transaction object
 * @returns Promise<void>
 */
export const executeExclusiveTransaction = async (
  callback: (txn: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> => {
  const db = getDatabase();

  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await callback(txn);
    });
  } catch (error) {
    console.error('[Database] Exclusive transaction error:', error);
    throw error;
  }
};

/**
 * Execute raw SQL (useful for schema creation and migrations)
 *
 * @param sql SQL statements to execute
 * @returns Promise<void>
 */
export const executeRawSQL = async (sql: string): Promise<void> => {
  const db = getDatabase();

  try {
    await db.execAsync(sql);
  } catch (error) {
    console.error('[Database] Raw SQL execution error:', error);
    throw error;
  }
};

/**
 * Close the database connection
 */
export const closeDatabase = async (): Promise<void> => {
  if (dbInstance) {
    console.log('[Database] Closing database connection');
    await dbInstance.closeAsync();
    dbInstance = null;
  }
};
