/**
 * SubscriptionManager Service
 *
 * Manages in-app purchases and subscriptions using RevenueCat.
 *
 * Based on CLAUDE.md requirements:
 * - Managed via RevenueCat (preferred) or StoreKit
 * - Free tier: 3 scans/month, 50 photo cleanups/period
 * - Pro tier: Unlimited scans and cleanups, all features enabled
 * - Update local usage_limits table when subscription changes
 *
 * RevenueCat Integration:
 * - Handles Apple purchase receipts
 * - Validates subscriptions
 * - Manages subscription lifecycle
 * - Provides cross-platform support (iOS/Android)
 *
 * Note: This implementation uses react-native-purchases (RevenueCat SDK).
 * Install with: npm install react-native-purchases
 */

import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  PurchasesError,
} from 'react-native-purchases';
import { UserTier, updateSubscriptionTier } from '../database/queries/usage';
import { Platform } from 'react-native';

/**
 * Subscription offering
 */
export interface SubscriptionOffering {
  identifier: string;
  packages: SubscriptionPackage[];
  serverDescription: string;
}

/**
 * Subscription package
 */
export interface SubscriptionPackage {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    description: string;
    title: string;
    price: string;
    priceString: string;
    currencyCode: string;
    introPrice?: {
      price: string;
      priceString: string;
      period: string;
    };
  };
}

/**
 * Purchase result
 */
export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
}

/**
 * Subscription status callback
 */
export type SubscriptionStatusCallback = (tier: UserTier) => void;

/**
 * SubscriptionManager class
 *
 * Handles in-app purchases and subscription management with RevenueCat.
 */
export class SubscriptionManager {
  private isInitialized: boolean = false;
  private statusCallbacks: SubscriptionStatusCallback[] = [];
  private currentTier: UserTier = UserTier.FREE;

  // RevenueCat configuration
  private readonly REVENUECAT_API_KEY_IOS = 'your_revenuecat_ios_key'; // TODO: Replace with actual key
  private readonly REVENUECAT_API_KEY_ANDROID = 'your_revenuecat_android_key'; // TODO: Replace with actual key
  private readonly PRO_ENTITLEMENT_ID = 'pro'; // Your entitlement identifier in RevenueCat

  /**
   * Initialize RevenueCat SDK
   *
   * Call this during app startup, before any purchase operations.
   *
   * @param appUserId Optional user ID for RevenueCat
   * @returns Promise<void>
   * @example
   * await subscriptionManager.initialize('user-123');
   */
  async initialize(appUserId?: string): Promise<void> {
    if (this.isInitialized) {
      console.warn('[SubscriptionManager] Already initialized');
      return;
    }

    try {
      // Configure RevenueCat
      const apiKey = Platform.OS === 'ios'
        ? this.REVENUECAT_API_KEY_IOS
        : this.REVENUECAT_API_KEY_ANDROID;

      // Initialize Purchases SDK
      await Purchases.configure({
        apiKey,
        appUserID: appUserId,
      });

      // Set up listener for customer info updates
      Purchases.addCustomerInfoUpdateListener(async (customerInfo) => {
        await this.handleCustomerInfoUpdate(customerInfo);
      });

      // Get initial customer info
      const customerInfo = await Purchases.getCustomerInfo();
      await this.handleCustomerInfoUpdate(customerInfo);

      this.isInitialized = true;

      console.log('[SubscriptionManager] Initialized successfully');
    } catch (error) {
      console.error('[SubscriptionManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get current user subscription tier
   *
   * Checks local cache first, then RevenueCat if needed.
   *
   * @returns Promise<UserTier>
   * @example
   * const tier = await subscriptionManager.getUserTier();
   * if (tier === UserTier.PRO) {
   *   // Show pro features
   * }
   */
  async getUserTier(): Promise<UserTier> {
    if (!this.isInitialized) {
      console.warn('[SubscriptionManager] Not initialized, returning cached tier');
      return this.currentTier;
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const tier = this.determineTierFromCustomerInfo(customerInfo);

      // Update local cache
      this.currentTier = tier;

      // Update database
      await updateSubscriptionTier(tier);

      return tier;
    } catch (error) {
      console.error('[SubscriptionManager] Error getting user tier:', error);
      return this.currentTier; // Return cached value on error
    }
  }

  /**
   * Get available subscription offerings
   *
   * Fetches available subscription products from RevenueCat.
   *
   * @returns Promise<SubscriptionOffering | null>
   * @example
   * const offerings = await subscriptionManager.getOfferings();
   * if (offerings) {
   *   offerings.packages.forEach(pkg => {
   *     console.log(`${pkg.product.title}: ${pkg.product.priceString}`);
   *   });
   * }
   */
  async getOfferings(): Promise<SubscriptionOffering | null> {
    if (!this.isInitialized) {
      throw new Error('SubscriptionManager not initialized');
    }

    try {
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        console.warn('[SubscriptionManager] No current offering available');
        return null;
      }

      const currentOffering = offerings.current;

      return {
        identifier: currentOffering.identifier,
        serverDescription: currentOffering.serverDescription,
        packages: currentOffering.availablePackages.map(pkg => ({
          identifier: pkg.identifier,
          packageType: pkg.packageType,
          product: {
            identifier: pkg.product.identifier,
            description: pkg.product.description,
            title: pkg.product.title,
            price: pkg.product.price.toString(),
            priceString: pkg.product.priceString,
            currencyCode: pkg.product.currencyCode,
            introPrice: pkg.product.introPrice ? {
              price: pkg.product.introPrice.price.toString(),
              priceString: pkg.product.introPrice.priceString,
              period: pkg.product.introPrice.periodNumberOfUnits.toString(),
            } : undefined,
          },
        })),
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error fetching offerings:', error);
      return null;
    }
  }

  /**
   * Purchase Pro subscription
   *
   * Initiates the purchase flow for a subscription package.
   *
   * @param packageIdentifier Package identifier from offerings
   * @returns Promise<PurchaseResult>
   * @example
   * const result = await subscriptionManager.purchasePro('monthly');
   * if (result.success) {
   *   console.log('Purchase successful!');
   *   // Unlock pro features
   * } else {
   *   console.error('Purchase failed:', result.error);
   * }
   */
  async purchasePro(packageIdentifier: string): Promise<PurchaseResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'SubscriptionManager not initialized',
      };
    }

    try {
      // Get offerings
      const offerings = await Purchases.getOfferings();

      if (!offerings.current) {
        return {
          success: false,
          error: 'No subscription offerings available',
        };
      }

      // Find the package
      const pkg = offerings.current.availablePackages.find(
        p => p.identifier === packageIdentifier
      );

      if (!pkg) {
        return {
          success: false,
          error: `Package ${packageIdentifier} not found`,
        };
      }

      // Make purchase
      const { customerInfo } = await Purchases.purchasePackage(pkg);

      // Update local tier
      const tier = this.determineTierFromCustomerInfo(customerInfo);
      this.currentTier = tier;
      await updateSubscriptionTier(tier);

      // Notify callbacks
      this.notifyStatusCallbacks(tier);

      console.log('[SubscriptionManager] Purchase successful');

      return {
        success: true,
        customerInfo,
      };
    } catch (error) {
      const purchaseError = error as PurchasesError;

      // Check if user cancelled
      if (purchaseError.userCancelled) {
        console.log('[SubscriptionManager] Purchase cancelled by user');
        return {
          success: false,
          error: 'Purchase cancelled',
        };
      }

      console.error('[SubscriptionManager] Purchase failed:', purchaseError);

      return {
        success: false,
        error: purchaseError.message || 'Purchase failed',
      };
    }
  }

  /**
   * Restore previous purchases
   *
   * Restores purchases from user's Apple/Google account.
   *
   * @returns Promise<PurchaseResult>
   * @example
   * const result = await subscriptionManager.restorePurchases();
   * if (result.success) {
   *   console.log('Purchases restored!');
   * }
   */
  async restorePurchases(): Promise<PurchaseResult> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'SubscriptionManager not initialized',
      };
    }

    try {
      const customerInfo = await Purchases.restorePurchases();

      // Update local tier
      const tier = this.determineTierFromCustomerInfo(customerInfo);
      this.currentTier = tier;
      await updateSubscriptionTier(tier);

      // Notify callbacks
      this.notifyStatusCallbacks(tier);

      console.log('[SubscriptionManager] Purchases restored');

      return {
        success: true,
        customerInfo,
      };
    } catch (error) {
      console.error('[SubscriptionManager] Restore failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Restore failed',
      };
    }
  }

  /**
   * Check if user has Pro entitlement
   *
   * @returns Promise<boolean>
   */
  async isPro(): Promise<boolean> {
    const tier = await this.getUserTier();
    return tier === UserTier.PRO;
  }

  /**
   * Register callback for subscription status changes
   *
   * @param callback Function to call when subscription status changes
   * @example
   * subscriptionManager.onSubscriptionUpdate((tier) => {
   *   if (tier === UserTier.PRO) {
   *     console.log('User upgraded to Pro!');
   *   }
   * });
   */
  onSubscriptionUpdate(callback: SubscriptionStatusCallback): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * Handle customer info update from RevenueCat
   *
   * @param customerInfo Customer info from RevenueCat
   */
  private async handleCustomerInfoUpdate(customerInfo: CustomerInfo): Promise<void> {
    const tier = this.determineTierFromCustomerInfo(customerInfo);

    // Update local tier
    const oldTier = this.currentTier;
    this.currentTier = tier;

    // Update database
    await updateSubscriptionTier(tier);

    // Notify callbacks if tier changed
    if (tier !== oldTier) {
      this.notifyStatusCallbacks(tier);
    }
  }

  /**
   * Determine user tier from customer info
   *
   * @param customerInfo Customer info from RevenueCat
   * @returns UserTier
   */
  private determineTierFromCustomerInfo(customerInfo: CustomerInfo): UserTier {
    // Check if user has Pro entitlement
    const hasPro = customerInfo.entitlements.active[this.PRO_ENTITLEMENT_ID] !== undefined;

    return hasPro ? UserTier.PRO : UserTier.FREE;
  }

  /**
   * Notify all subscription status callbacks
   *
   * @param tier New tier
   */
  private notifyStatusCallbacks(tier: UserTier): void {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(tier);
      } catch (error) {
        console.error('[SubscriptionManager] Error in status callback:', error);
      }
    });
  }

  /**
   * Update local subscription tier
   *
   * Updates the local database with the new tier.
   * This is called automatically by RevenueCat listener, but can be called manually.
   *
   * @param tier New tier
   * @returns Promise<void>
   */
  async updateLocalTier(tier: UserTier): Promise<void> {
    this.currentTier = tier;
    await updateSubscriptionTier(tier);
    this.notifyStatusCallbacks(tier);
  }

  /**
   * Get subscription expiration date (if available)
   *
   * @returns Promise<Date | null>
   */
  async getExpirationDate(): Promise<Date | null> {
    if (!this.isInitialized) {
      return null;
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const proEntitlement = customerInfo.entitlements.active[this.PRO_ENTITLEMENT_ID];

      if (proEntitlement && proEntitlement.expirationDate) {
        return new Date(proEntitlement.expirationDate);
      }

      return null;
    } catch (error) {
      console.error('[SubscriptionManager] Error getting expiration date:', error);
      return null;
    }
  }

  /**
   * Check if subscription is active
   *
   * @returns Promise<boolean>
   */
  async isSubscriptionActive(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const proEntitlement = customerInfo.entitlements.active[this.PRO_ENTITLEMENT_ID];

      return proEntitlement !== undefined;
    } catch (error) {
      console.error('[SubscriptionManager] Error checking subscription status:', error);
      return false;
    }
  }
}

// Export singleton instance
export const subscriptionManager = new SubscriptionManager();
