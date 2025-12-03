/**
 * Usage Limits query module
 *
 * This module manages freemium tier enforcement.
 *
 * Based on CLAUDE.md requirements:
 * - Free tier: 3 scans/month, 50 photo cleanups/period
 * - Pro tier: Unlimited scans and cleanups
 * - Monthly period reset based on period_start_date
 * - All checks happen locally in SQLite (no network required)
 */

import { executeQuery, executeQueryFirst, executeNonQuery } from '../init';

/**
 * User tier enum
 */
export enum UserTier {
  FREE = 'free',
  PRO = 'pro',
}

/**
 * Usage limits type definition
 */
export interface UsageLimits {
  id: number;
  user_tier: UserTier;
  scans_performed: number;
  scans_limit: number;
  duplicates_cleaned: number;
  duplicates_limit: number;
  period_start_date: number;
  period_end_date?: number;
  updated_at: number;
}

/**
 * Usage check result
 */
export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  tier: UserTier;
  message?: string;
}

/**
 * Get current usage limits
 *
 * @returns Promise<UsageLimits | null>
 */
export const getUsageLimits = async (): Promise<UsageLimits | null> => {
  // There should only be one row (id = 1)
  const limits = await executeQueryFirst<UsageLimits>(
    'SELECT * FROM usage_limits WHERE id = 1;',
    []
  );

  return limits;
};

/**
 * Get current user tier
 *
 * @returns Promise<UserTier>
 */
export const getUserTier = async (): Promise<UserTier> => {
  const limits = await getUsageLimits();
  return limits ? (limits.user_tier as UserTier) : UserTier.FREE;
};

/**
 * Check if user can perform a scan
 *
 * @returns Promise<UsageCheckResult>
 */
export const canPerformScan = async (): Promise<UsageCheckResult> => {
  const limits = await getUsageLimits();

  if (!limits) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      tier: UserTier.FREE,
      message: 'Usage limits not initialized',
    };
  }

  // Pro users have unlimited scans
  if (limits.user_tier === UserTier.PRO) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      tier: UserTier.PRO,
    };
  }

  // Check if period needs reset
  await checkAndResetPeriod();

  // Refresh limits after potential reset
  const refreshedLimits = await getUsageLimits();
  if (!refreshedLimits) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      tier: UserTier.FREE,
    };
  }

  const remaining = refreshedLimits.scans_limit - refreshedLimits.scans_performed;
  const allowed = remaining > 0;

  return {
    allowed,
    remaining,
    limit: refreshedLimits.scans_limit,
    tier: UserTier.FREE,
    message: allowed ? undefined : 'Scan limit reached for this month',
  };
};

/**
 * Check if user can cleanup duplicates
 *
 * @param count Number of duplicates to cleanup
 * @returns Promise<UsageCheckResult>
 */
export const canCleanupDuplicates = async (count: number): Promise<UsageCheckResult> => {
  const limits = await getUsageLimits();

  if (!limits) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      tier: UserTier.FREE,
      message: 'Usage limits not initialized',
    };
  }

  // Pro users have unlimited cleanup
  if (limits.user_tier === UserTier.PRO) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      tier: UserTier.PRO,
    };
  }

  // Check if period needs reset
  await checkAndResetPeriod();

  // Refresh limits after potential reset
  const refreshedLimits = await getUsageLimits();
  if (!refreshedLimits) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      tier: UserTier.FREE,
    };
  }

  const remaining = refreshedLimits.duplicates_limit - refreshedLimits.duplicates_cleaned;
  const allowed = remaining >= count;

  return {
    allowed,
    remaining,
    limit: refreshedLimits.duplicates_limit,
    tier: UserTier.FREE,
    message: allowed ? undefined : `Cleanup limit reached. You can clean up to ${remaining} more photos this month`,
  };
};

/**
 * Increment scan counter
 *
 * Call this after a successful scan.
 *
 * @returns Promise<void>
 */
export const incrementScanCount = async (): Promise<void> => {
  await executeNonQuery(
    `UPDATE usage_limits
     SET scans_performed = scans_performed + 1,
         updated_at = strftime('%s', 'now')
     WHERE id = 1;`,
    []
  );

  console.log('[Usage] Scan count incremented');
};

/**
 * Increment cleanup counter
 *
 * Call this after successfully cleaning up duplicates.
 *
 * @param count Number of duplicates cleaned
 * @returns Promise<void>
 */
export const incrementCleanupCount = async (count: number): Promise<void> => {
  await executeNonQuery(
    `UPDATE usage_limits
     SET duplicates_cleaned = duplicates_cleaned + ?,
         updated_at = strftime('%s', 'now')
     WHERE id = 1;`,
    [count]
  );

  console.log(`[Usage] Cleanup count incremented by ${count}`);
};

/**
 * Check if period should be reset
 *
 * Based on CLAUDE.md: Monthly reset based on period_start_date
 *
 * @returns Promise<boolean> True if period was reset
 */
const checkAndResetPeriod = async (): Promise<boolean> => {
  const limits = await getUsageLimits();

  if (!limits) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
  const periodStartDate = limits.period_start_date;

  // Calculate period end date (30 days from period start)
  const periodEndDate = periodStartDate + (30 * 24 * 60 * 60); // 30 days in seconds

  if (now >= periodEndDate) {
    // Period has ended, reset counters
    await resetMonthlyUsage();
    console.log('[Usage] Monthly period reset');
    return true;
  }

  return false;
};

/**
 * Reset monthly usage counters
 *
 * This sets scans_performed and duplicates_cleaned to 0
 * and updates the period_start_date to now.
 *
 * @returns Promise<void>
 */
export const resetMonthlyUsage = async (): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);

  await executeNonQuery(
    `UPDATE usage_limits
     SET scans_performed = 0,
         duplicates_cleaned = 0,
         period_start_date = ?,
         updated_at = strftime('%s', 'now')
     WHERE id = 1;`,
    [now]
  );

  console.log('[Usage] Monthly usage reset');
};

/**
 * Update subscription tier
 *
 * Call this when user purchases Pro or subscription expires.
 *
 * @param tier New user tier
 * @returns Promise<void>
 */
export const updateSubscriptionTier = async (tier: UserTier): Promise<void> => {
  await executeNonQuery(
    `UPDATE usage_limits
     SET user_tier = ?,
         updated_at = strftime('%s', 'now')
     WHERE id = 1;`,
    [tier]
  );

  console.log(`[Usage] Subscription tier updated to ${tier}`);
};

/**
 * Get remaining usage for current period
 *
 * @returns Promise with scans and cleanup remaining
 */
export const getRemainingUsage = async (): Promise<{
  scansRemaining: number;
  cleanupsRemaining: number;
  tier: UserTier;
}> => {
  const limits = await getUsageLimits();

  if (!limits) {
    return {
      scansRemaining: 0,
      cleanupsRemaining: 0,
      tier: UserTier.FREE,
    };
  }

  // Pro users have unlimited usage
  if (limits.user_tier === UserTier.PRO) {
    return {
      scansRemaining: Infinity,
      cleanupsRemaining: Infinity,
      tier: UserTier.PRO,
    };
  }

  // Check if period needs reset
  await checkAndResetPeriod();

  // Refresh limits after potential reset
  const refreshedLimits = await getUsageLimits();
  if (!refreshedLimits) {
    return {
      scansRemaining: 0,
      cleanupsRemaining: 0,
      tier: UserTier.FREE,
    };
  }

  return {
    scansRemaining: Math.max(0, refreshedLimits.scans_limit - refreshedLimits.scans_performed),
    cleanupsRemaining: Math.max(0, refreshedLimits.duplicates_limit - refreshedLimits.duplicates_cleaned),
    tier: UserTier.FREE,
  };
};

/**
 * Get days until period reset
 *
 * @returns Promise<number> Days remaining in current period
 */
export const getDaysUntilReset = async (): Promise<number> => {
  const limits = await getUsageLimits();

  if (!limits) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  const periodStartDate = limits.period_start_date;
  const periodEndDate = periodStartDate + (30 * 24 * 60 * 60); // 30 days

  const secondsRemaining = periodEndDate - now;
  const daysRemaining = Math.ceil(secondsRemaining / (24 * 60 * 60));

  return Math.max(0, daysRemaining);
};

/**
 * Initialize usage limits for a new user
 *
 * This is called during first app launch if no usage limits exist.
 *
 * @returns Promise<void>
 */
export const initializeUsageLimits = async (): Promise<void> => {
  const exists = await getUsageLimits();

  if (exists) {
    console.log('[Usage] Usage limits already initialized');
    return;
  }

  const now = Math.floor(Date.now() / 1000);

  await executeNonQuery(
    `INSERT INTO usage_limits (id, user_tier, scans_limit, duplicates_limit, period_start_date)
     VALUES (1, ?, 3, 50, ?);`,
    [UserTier.FREE, now]
  );

  console.log('[Usage] Usage limits initialized for free tier');
};
