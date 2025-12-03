/**
 * Database module index
 *
 * Central export point for all database functionality.
 *
 * Example usage:
 * ```typescript
 * import { initializeDatabase, runMigrations, getAllPhotos } from '@/database';
 * ```
 */

// Database initialization
export * from './init';

// Schema
export * from './schema';

// Migrations
export * from './migrations';

// Setup and utilities
export * from './setup';
export * from './utils';

// All query modules
export * from './queries';
