// src/config/revenueCat.ts
/**
 * RevenueCat Configuration
 *
 * Get your API keys from: RevenueCat Dashboard → Project Settings → API Keys
 * Get your product IDs from: App Store Connect → In-App Purchases
 */

export const REVENUECAT_CONFIG = {
  /**
   * RevenueCat API Keys
   * Get this from RevenueCat dashboard → Project Settings → API Keys
   */
  apiKey: {
    // iOS API key - starts with 'appl_'
    // TODO: Replace with your actual iOS API key from RevenueCat dashboard
    ios: 'test_uvtEcZJUUhluRFgXPKSgPeKfAmY',

    // Android API key - starts with 'goog_' (for future Android support)
    android: 'goog_YOUR_ANDROID_KEY_HERE',
  },

  /**
   * Entitlement ID
   * Must match the entitlement identifier created in RevenueCat dashboard
   * This is what determines if a user has "Pro" access
   */
  entitlementId: 'pro',

  /**
   * Default Offering ID
   * Must match the offering identifier in RevenueCat dashboard
   */
  defaultOfferingId: 'default',

  /**
   * Product Identifiers
   * Must match the product IDs created in App Store Connect → In-App Purchases
   * These should also be linked to the offering in RevenueCat dashboard
   */
  products: {
    monthly: 'cleanspace_pro_monthly',
    annual: 'cleanspace_pro_annual',
  },
} as const;

/**
 * Subscription Tier Type
 * Used throughout the app to check user's subscription status
 */
export type SubscriptionTier = 'free' | 'pro';
