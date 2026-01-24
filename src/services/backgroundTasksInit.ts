/**
 * Background Tasks Initialization
 *
 * This file must be imported and executed at the top level of your app
 * (before the App component is registered) to ensure TaskManager tasks
 * are properly defined.
 *
 * Usage in App.tsx:
 * ```
 * import './src/services/backgroundTasksInit';
 * ```
 */

import { backgroundScanService } from './BackgroundScanService';

/**
 * Initialize all background tasks
 * This should be called once at app startup
 */
export async function initializeBackgroundTasks() {
  try {
    console.log('[Background Tasks] Initializing...');

    // Initialize background scan service
    await backgroundScanService.initialize();

    console.log('[Background Tasks] Initialized successfully');
  } catch (error) {
    console.error('[Background Tasks] Initialization error:', error);
  }
}

// Auto-initialize when this module is imported
initializeBackgroundTasks();
