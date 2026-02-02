/**
 * Database queries index
 *
 * Central export point for all query modules.
 * Import from here to access all database operations.
 *
 * Example usage:
 * ```typescript
 * import { getAllPhotos, getPreference, canPerformScan } from '@/database/queries';
 * ```
 */

// Photos queries
export * from './photos';

// Videos queries
export * from './videos';

// Preferences queries
export * from './preferences';

// Usage limits queries
export * from './usage';

// Photo hashes queries
export * from './hashes';

// Duplicates queries
export * from './duplicates';

// Sync queue queries
export * from './sync';
