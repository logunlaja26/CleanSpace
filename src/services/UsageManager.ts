/**
 * UsageManager Service
 *
 * Manages freemium tier enforcement for CleanSpace app.
 *
 * Based on CLAUDE.md requirements:
 * - Free tier: 3 scans/month, 50 photo cleanups/period
 * - Pro tier: Unlimited scans and cleanups
 * - Monthly period reset based on period_start_date
 * - All checks happen locally in SQLite (no network required)
 *
 * This service provides a clean API for the UI to check and record usage.
 */

import {
  UserTier,
  UsageCheckResult,
  getUsageLimits,
  canPerformScan,
  canCleanupDuplicates,
  incrementScanCount,
  incrementCleanupCount,
  resetMonthlyUsage,
  updateSubscriptionTier,
  getRemainingUsage,
  getDaysUntilReset,
  getUserTier as getUserTierQuery,
  initializeUsageLimits,
} from '../database/queries/usage';

/**
 * Custom error for when usage limits are reached
 */
export class LimitReachedError extends Error {
  public readonly code: string;
  public readonly tier: UserTier;
  public readonly remaining: number;
  public readonly limit: number;

  constructor(message: string, code: string, tier: UserTier, remaining: number, limit: number) {
    super(message);
    this.name = 'LimitReachedError';
    this.code = code;
    this.tier = tier;
    this.remaining = remaining;
    this.limit = limit;
  }
}

/**
 * UsageManager class
 *
 * Stateless service for managing user usage limits and subscription tiers.
 */
export class UsageManager {
  /**
   * Get current user tier (free or pro)
   *
   * @returns Promise<UserTier>
   */
  async getUserTier(): Promise<UserTier> {
    return await getUserTierQuery();
  }

  /**
   * Check if user can perform a scan
   *
   * @returns Promise<UsageCheckResult> - Contains allowed status and remaining count
   * @example
   * const result = await usageManager.canPerformScan();
   * if (!result.allowed) {
   *   alert(result.message);
   * }
   */
  async canPerformScan(): Promise<UsageCheckResult> {
    return await canPerformScan();
  }

  /**
   * Check if user can perform a scan, throwing error if not allowed
   *
   * Use this when you want to enforce the limit with exceptions.
   *
   * @throws {LimitReachedError} When scan limit is reached
   * @returns Promise<void>
   * @example
   * try {
   *   await usageManager.requireScanAllowed();
   *   // Proceed with scan
   * } catch (error) {
   *   if (error instanceof LimitReachedError) {
   *     // Show paywall
   *   }
   * }
   */
  async requireScanAllowed(): Promise<void> {
    const result = await this.canPerformScan();
    if (!result.allowed) {
      throw new LimitReachedError(
        result.message || 'Scan limit reached',
        'scan_limit_reached',
        result.tier,
        result.remaining,
        result.limit
      );
    }
  }

  /**
   * Record a successful scan
   *
   * Call this AFTER a scan completes successfully to increment the counter.
   *
   * @returns Promise<void>
   * @example
   * await photoScanner.startScan();
   * await usageManager.recordScan();
   */
  async recordScan(): Promise<void> {
    await incrementScanCount();
  }

  /**
   * Check if user can cleanup duplicates
   *
   * @param count Number of photos to cleanup
   * @returns Promise<UsageCheckResult> - Contains allowed status and remaining count
   * @example
   * const result = await usageManager.canCleanupDuplicates(10);
   * if (!result.allowed) {
   *   alert(`You can only clean ${result.remaining} more photos this month`);
   * }
   */
  async canCleanupDuplicates(count: number): Promise<UsageCheckResult> {
    return await canCleanupDuplicates(count);
  }

  /**
   * Check if user can cleanup duplicates, throwing error if not allowed
   *
   * Use this when you want to enforce the limit with exceptions.
   *
   * @param count Number of photos to cleanup
   * @throws {LimitReachedError} When cleanup limit is reached
   * @returns Promise<void>
   * @example
   * try {
   *   await usageManager.requireCleanupAllowed(25);
   *   // Proceed with cleanup
   * } catch (error) {
   *   if (error instanceof LimitReachedError) {
   *     // Show limit reached message
   *   }
   * }
   */
  async requireCleanupAllowed(count: number): Promise<void> {
    const result = await this.canCleanupDuplicates(count);
    if (!result.allowed) {
      throw new LimitReachedError(
        result.message || 'Cleanup limit reached',
        'cleanup_limit_reached',
        result.tier,
        result.remaining,
        result.limit
      );
    }
  }

  /**
   * Record successful duplicate cleanup
   *
   * Call this AFTER duplicates are successfully deleted.
   *
   * @param count Number of photos cleaned up
   * @returns Promise<void>
   * @example
   * await deletePhotos(selectedPhotos);
   * await usageManager.recordCleanup(selectedPhotos.length);
   */
  async recordCleanup(count: number): Promise<void> {
    await incrementCleanupCount(count);
  }

  /**
   * Check if monthly period should be reset
   *
   * This is called automatically by the query layer, but can be called
   * manually if needed (e.g., for testing).
   *
   * @returns Promise<boolean> True if period was reset
   */
  async shouldResetPeriod(): Promise<boolean> {
    const limits = await getUsageLimits();
    if (!limits) return false;

    const now = Math.floor(Date.now() / 1000);
    const periodEndDate = limits.period_start_date + (30 * 24 * 60 * 60);

    return now >= periodEndDate;
  }

  /**
   * Manually reset monthly usage counters
   *
   * This should typically happen automatically, but can be called
   * manually for testing or admin purposes.
   *
   * @returns Promise<void>
   */
  async resetMonthlyUsage(): Promise<void> {
    await resetMonthlyUsage();
  }

  /**
   * Get remaining usage for current period
   *
   * @returns Promise with scans and cleanups remaining
   * @example
   * const usage = await usageManager.getRemainingUsage();
   * console.log(`You have ${usage.scansRemaining} scans left this month`);
   */
  async getRemainingUsage(): Promise<{
    scansRemaining: number;
    cleanupsRemaining: number;
    tier: UserTier;
  }> {
    return await getRemainingUsage();
  }

  /**
   * Get days until period reset
   *
   * @returns Promise<number> Days remaining in current period
   * @example
   * const days = await usageManager.getDaysUntilReset();
   * console.log(`Your limits reset in ${days} days`);
   */
  async getDaysUntilReset(): Promise<number> {
    return await getDaysUntilReset();
  }

  /**
   * Update user subscription tier
   *
   * Call this when user purchases Pro or when subscription expires.
   *
   * @param tier New user tier
   * @returns Promise<void>
   * @example
   * // After successful purchase
   * await usageManager.updateSubscriptionTier(UserTier.PRO);
   */
  async updateSubscriptionTier(tier: UserTier): Promise<void> {
    await updateSubscriptionTier(tier);
  }

  /**
   * Check if user has Pro tier
   *
   * @returns Promise<boolean>
   * @example
   * if (await usageManager.isPro()) {
   *   // Show pro features
   * }
   */
  async isPro(): Promise<boolean> {
    const tier = await this.getUserTier();
    return tier === UserTier.PRO;
  }

  /**
   * Check if user has Free tier
   *
   * @returns Promise<boolean>
   */
  async isFree(): Promise<boolean> {
    const tier = await this.getUserTier();
    return tier === UserTier.FREE;
  }

  /**
   * Initialize usage limits for a new user
   *
   * This should be called during first app launch.
   *
   * @returns Promise<void>
   */
  async initialize(): Promise<void> {
    await initializeUsageLimits();
  }

  /**
   * DEVELOPMENT ONLY: Reset all usage counters to zero
   *
   * This is for testing purposes only. Do NOT use in production.
   *
   * @returns Promise<void>
   * @example
   * // In your dev environment
   * await usageManager.devResetUsage();
   */
  async devResetUsage(): Promise<void> {
    if (__DEV__) {
      await resetMonthlyUsage();
      console.log('✅ Development: Usage counters reset');
    } else {
      console.warn('⚠️ devResetUsage() can only be called in development mode');
    }
  }

  /**
   * DEVELOPMENT ONLY: Set user to Pro tier for testing
   *
   * @returns Promise<void>
   */
  async devSetPro(): Promise<void> {
    if (__DEV__) {
      await updateSubscriptionTier(UserTier.PRO);
      console.log('✅ Development: Set to PRO tier');
    } else {
      console.warn('⚠️ devSetPro() can only be called in development mode');
    }
  }

  /**
   * DEVELOPMENT ONLY: Set user to Free tier for testing
   *
   * @returns Promise<void>
   */
  async devSetFree(): Promise<void> {
    if (__DEV__) {
      await updateSubscriptionTier(UserTier.FREE);
      await resetMonthlyUsage();
      console.log('✅ Development: Set to FREE tier with reset counters');
    } else {
      console.warn('⚠️ devSetFree() can only be called in development mode');
    }
  }

  /**
   * Get usage summary for UI display
   *
   * @returns Promise with complete usage information
   * @example
   * const summary = await usageManager.getUsageSummary();
   * return (
   *   <Text>
   *     {summary.tier === 'pro' ? 'Pro User' : `${summary.scansRemaining} scans left`}
   *   </Text>
   * );
   */
  async getUsageSummary(): Promise<{
    tier: UserTier;
    isPro: boolean;
    scansRemaining: number;
    scansLimit: number;
    cleanupsRemaining: number;
    cleanupsLimit: number;
    daysUntilReset: number;
  }> {
    const tier = await this.getUserTier();
    const isPro = tier === UserTier.PRO;
    const usage = await getRemainingUsage();
    const days = await getDaysUntilReset();
    const limits = await getUsageLimits();

    return {
      tier,
      isPro,
      scansRemaining: usage.scansRemaining,
      scansLimit: limits?.scans_limit || 3,
      cleanupsRemaining: usage.cleanupsRemaining,
      cleanupsLimit: limits?.duplicates_limit || 50,
      daysUntilReset: days,
    };
  }
}

// Export singleton instance for convenience
export const usageManager = new UsageManager();

// Export types for use in other modules
export { UserTier, UsageCheckResult };
