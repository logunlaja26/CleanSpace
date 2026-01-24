import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { PhotoScanner } from './PhotoScanner';
import { UsageManager } from './UsageManager';
import { getPreference } from '../database/queries/preferences';

/**
 * BackgroundScanService
 *
 * Handles background photo scanning operations (Pro feature)
 * - Automatic background scans on schedule
 * - Battery and charging state checks
 * - Respects user preferences
 * - Enforces Pro tier restrictions
 * - Performs quick/incremental scans only
 */

// Task name for background scan
export const BACKGROUND_SCAN_TASK = 'background-photo-scan';

// Background scan configuration
export interface BackgroundScanConfig {
  enabled: boolean;
  intervalHours: number; // Scan interval in hours (default 24)
  requireCharging: boolean; // Only scan when charging (default true)
  minimumBatteryLevel: number; // Minimum battery % (default 20)
  scanType: 'quick' | 'incremental'; // Type of scan to perform
}

// Default configuration
const DEFAULT_CONFIG: BackgroundScanConfig = {
  enabled: false,
  intervalHours: 24,
  requireCharging: true,
  minimumBatteryLevel: 20,
  scanType: 'quick',
};

export class BackgroundScanService {
  private usageManager: UsageManager;
  private photoScanner: PhotoScanner;

  constructor() {
    this.usageManager = new UsageManager();
    this.photoScanner = new PhotoScanner();
  }

  /**
   * Check if user has Pro tier (background scanning is Pro-only)
   */
  private async ensureProTier(): Promise<boolean> {
    try {
      const tier = await this.usageManager.getUserTier();
      return tier === 'pro';
    } catch {
      return false;
    }
  }

  /**
   * Get background scan configuration from user preferences
   */
  async getConfig(): Promise<BackgroundScanConfig> {
    try {
      const enabled = (await getPreference('background_scan_enabled')) === 'true';
      const intervalHours = parseInt(
        (await getPreference('background_scan_interval')) || '24',
        10
      );
      const requireCharging = (await getPreference('background_scan_only_charging')) !== 'false';
      const minimumBatteryLevel = parseInt(
        (await getPreference('background_scan_min_battery')) || '20',
        10
      );
      const scanType = ((await getPreference('background_scan_type')) || 'quick') as
        | 'quick'
        | 'incremental';

      return {
        enabled,
        intervalHours,
        requireCharging,
        minimumBatteryLevel,
        scanType,
      };
    } catch (error) {
      console.error('Error loading background scan config:', error);
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Check if conditions are met for background scanning
   */
  private async canRunBackgroundScan(): Promise<{
    canRun: boolean;
    reason?: string;
  }> {
    // Check Pro tier
    const isPro = await this.ensureProTier();
    if (!isPro) {
      return { canRun: false, reason: 'Pro tier required' };
    }

    // Check if background scanning is enabled
    const config = await this.getConfig();
    if (!config.enabled) {
      return { canRun: false, reason: 'Background scanning disabled in settings' };
    }

    // Check battery level
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryPercent = batteryLevel * 100;

      if (batteryPercent < config.minimumBatteryLevel) {
        return {
          canRun: false,
          reason: `Battery too low: ${batteryPercent.toFixed(0)}% (minimum: ${
            config.minimumBatteryLevel
          }%)`,
        };
      }

      // Check if charging (if required)
      if (config.requireCharging) {
        const batteryState = await Battery.getBatteryStateAsync();
        const isCharging = batteryState === Battery.BatteryState.CHARGING;

        if (!isCharging) {
          return { canRun: false, reason: 'Device not charging' };
        }
      }

      return { canRun: true };
    } catch (error) {
      console.error('Error checking battery state:', error);
      return { canRun: false, reason: 'Could not check battery state' };
    }
  }

  /**
   * Initialize and register background scan task
   */
  async initialize(): Promise<void> {
    // Define the background task
    TaskManager.defineTask(BACKGROUND_SCAN_TASK, async () => {
      try {
        console.log('[Background Scan] Task started');

        // Check if we can run
        const { canRun, reason } = await this.canRunBackgroundScan();
        if (!canRun) {
          console.log(`[Background Scan] Skipped: ${reason}`);
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Get scan configuration
        const config = await this.getConfig();

        // Perform scan
        console.log(`[Background Scan] Starting ${config.scanType} scan...`);
        const result = await this.photoScanner.startScan(config.scanType);

        console.log(
          `[Background Scan] Completed: ${result.photosFound} photos, ${result.newPhotos} new`
        );

        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('[Background Scan] Error:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    console.log('[Background Scan] Task defined');
  }

  /**
   * Register background scan task with BackgroundFetch
   */
  async register(): Promise<void> {
    try {
      // Ensure Pro tier
      const isPro = await this.ensureProTier();
      if (!isPro) {
        throw new Error('Background scanning is a Pro feature. Please upgrade to continue.');
      }

      // Get configuration
      const config = await this.getConfig();
      const intervalSeconds = config.intervalHours * 60 * 60;

      // Register the task
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SCAN_TASK, {
        minimumInterval: intervalSeconds,
        stopOnTerminate: false, // Continue after app termination
        startOnBoot: true, // Start after device boot
      });

      console.log(
        `[Background Scan] Registered with interval: ${config.intervalHours} hours`
      );
    } catch (error) {
      console.error('[Background Scan] Registration error:', error);
      throw error;
    }
  }

  /**
   * Unregister background scan task
   */
  async unregister(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SCAN_TASK);
      console.log('[Background Scan] Unregistered');
    } catch (error) {
      console.error('[Background Scan] Unregister error:', error);
      throw error;
    }
  }

  /**
   * Check if background scan is registered
   */
  async isRegistered(): Promise<boolean> {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SCAN_TASK);

      // BackgroundFetch is available and task is registered
      return (
        status === BackgroundFetch.BackgroundFetchStatus.Available && isRegistered
      );
    } catch (error) {
      console.error('[Background Scan] Status check error:', error);
      return false;
    }
  }

  /**
   * Enable background scanning
   */
  async enable(config?: Partial<BackgroundScanConfig>): Promise<void> {
    // Ensure Pro tier
    const isPro = await this.ensureProTier();
    if (!isPro) {
      throw new Error('Background scanning is a Pro feature. Please upgrade to continue.');
    }

    // Update preferences if config provided
    if (config) {
      const { setPreference } = await import('../database/queries/preferences');

      if (config.enabled !== undefined) {
        await setPreference('background_scan_enabled', config.enabled.toString());
      }
      if (config.intervalHours !== undefined) {
        await setPreference('background_scan_interval', config.intervalHours.toString());
      }
      if (config.requireCharging !== undefined) {
        await setPreference(
          'background_scan_only_charging',
          config.requireCharging.toString()
        );
      }
      if (config.minimumBatteryLevel !== undefined) {
        await setPreference(
          'background_scan_min_battery',
          config.minimumBatteryLevel.toString()
        );
      }
      if (config.scanType !== undefined) {
        await setPreference('background_scan_type', config.scanType);
      }
    }

    // Register the task
    await this.register();
  }

  /**
   * Disable background scanning
   */
  async disable(): Promise<void> {
    const { setPreference } = await import('../database/queries/preferences');
    await setPreference('background_scan_enabled', 'false');
    await this.unregister();
  }

  /**
   * Get background fetch status
   */
  async getStatus(): Promise<{
    available: boolean;
    registered: boolean;
    enabled: boolean;
    isPro: boolean;
    config: BackgroundScanConfig;
  }> {
    const status = await BackgroundFetch.getStatusAsync();
    const registered = await this.isRegistered();
    const config = await this.getConfig();
    const isPro = await this.ensureProTier();

    return {
      available: status === BackgroundFetch.BackgroundFetchStatus.Available,
      registered,
      enabled: config.enabled,
      isPro,
      config,
    };
  }

  /**
   * Check if background scanning is available (Pro tier check)
   */
  async isBackgroundScanAvailable(): Promise<boolean> {
    return await this.ensureProTier();
  }

  /**
   * Test background scan manually (for debugging)
   */
  async testBackgroundScan(): Promise<void> {
    const { canRun, reason } = await this.canRunBackgroundScan();

    console.log('[Background Scan Test]');
    console.log('Can run:', canRun);
    if (reason) {
      console.log('Reason:', reason);
    }

    if (canRun) {
      const config = await this.getConfig();
      console.log('Starting test scan...');
      const result = await this.photoScanner.startScan(config.scanType);
      console.log('Test scan completed:', result);
    }
  }
}

// Export singleton instance
export const backgroundScanService = new BackgroundScanService();
