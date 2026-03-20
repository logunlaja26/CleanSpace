/**
 * useSubscription Hook
 *
 * React hook for accessing subscription status in components.
 * Automatically updates when subscription changes.
 *
 * @example
 * function MyComponent() {
 *   const { isPro, tier, loading, refresh } = useSubscription();
 *
 *   if (loading) return <LoadingSpinner />;
 *
 *   return (
 *     <View>
 *       <Text>Current Tier: {tier}</Text>
 *       {isPro ? <ProFeature /> : <UpgradeButton />}
 *     </View>
 *   );
 * }
 */

import { useEffect, useState } from 'react';
import { subscriptionManager } from '../services/SubscriptionManager';
import { UserTier } from '../database/queries/usage';

export interface UseSubscriptionResult {
  /** Whether user has Pro subscription */
  isPro: boolean;
  /** Current subscription tier (free or pro) */
  tier: UserTier;
  /** Whether subscription status is being loaded */
  loading: boolean;
  /** Function to manually refresh subscription status */
  refresh: () => Promise<void>;
}

/**
 * Hook to access subscription status
 *
 * Provides real-time subscription status that updates automatically
 * when the user's subscription changes.
 *
 * @returns UseSubscriptionResult
 */
export function useSubscription(): UseSubscriptionResult {
  const [tier, setTier] = useState<UserTier>(UserTier.FREE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial status
    checkSubscription();

    // Listen for updates from RevenueCat
    subscriptionManager.onSubscriptionUpdate((newTier) => {
      console.log('[useSubscription] Tier updated:', newTier);
      setTier(newTier);
    });
  }, []);

  /**
   * Check subscription status from RevenueCat
   */
  const checkSubscription = async () => {
    try {
      setLoading(true);
      const currentTier = await subscriptionManager.getUserTier();
      setTier(currentTier);
    } catch (error) {
      console.error('[useSubscription] Error checking subscription:', error);
      // Keep current tier on error
    } finally {
      setLoading(false);
    }
  };

  return {
    isPro: tier === UserTier.PRO,
    tier,
    loading,
    refresh: checkSubscription,
  };
}
