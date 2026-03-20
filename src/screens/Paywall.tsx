import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LoadingSpinner, ErrorState } from '../components';

// Services
import { subscriptionManager } from '../services/SubscriptionManager';
import { UserTier } from '../database/queries/usage';

type PaywallProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Paywall'>;
};

type PricingPlan = {
  id: string;
  name: string;
  price: string;
  period: string;
  savings?: string;
  popular?: boolean;
};

export default function Paywall({ navigation }: PaywallProps) {
  // State management
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>('yearly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  /**
   * Load pricing plans from SubscriptionManager
   */
  const loadPricingPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Initialize subscription manager if not already initialized
      await subscriptionManager.initialize();

      // Get offerings from RevenueCat
      const offerings = await subscriptionManager.getOfferings();
      console.log("[Paywall] offerings",JSON.stringify(offerings,null,2))
      console.log("[Paywall] offerings exists?", offerings !== null && offerings !== undefined);
      console.log("[Paywall] offerings.packages exists?", offerings?.packages !== undefined);
      console.log("[Paywall] offerings.packages length:", offerings?.packages?.length || 0);

      if (!offerings) {
        throw new Error('No offerings available from RevenueCat');
      }

      if (!offerings.packages || offerings.packages.length === 0) {
        throw new Error('No packages found in the offering. Please check your RevenueCat dashboard.');
      }

      // Transform to UI format
      const plans: PricingPlan[] = offerings.packages.map(pkg => {
        console.log('[Paywall] Package identifier:', pkg.identifier);
        console.log('[Paywall] Package type:', pkg.packageType);
        return {
          id: pkg.identifier,
          name: pkg.product.title || pkg.identifier,
          price: pkg.product.priceString || '$0.00',
          period: pkg.packageType || 'one-time',
          popular: pkg.identifier.toLowerCase().includes('yearly') || pkg.identifier.toLowerCase().includes('annual'),
          savings: pkg.identifier.toLowerCase().includes('yearly') || pkg.identifier.toLowerCase().includes('annual') ? 'Save 50%' :
                   pkg.identifier.toLowerCase().includes('lifetime') ? 'Best Value' : undefined,
        };
      }) || [];

      console.log('[Paywall] Loaded plans:', plans.map(p => ({ id: p.id, name: p.name })));
      setPricingPlans(plans);

      // Set default selected plan if available
      if (plans.length > 0) {
        const yearlyPlan = plans.find(p => p.id === 'yearly');
        const defaultPlanId = yearlyPlan ? yearlyPlan.id : plans[0].id;
        console.log('[Paywall] Setting default selected plan:', defaultPlanId);
        setSelectedPlan(defaultPlanId);
      } else {
        console.warn('[Paywall] No plans loaded from offerings!');
      }
    } catch (err) {
      console.error('Error loading pricing plans:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pricing plans');

      // Fallback to mock data for development/testing
      const mockPlans: PricingPlan[] = [
        { id: 'monthly', name: 'Monthly', price: '$4.99', period: '/month' },
        { id: 'yearly', name: 'Yearly', price: '$29.99', period: '/year', savings: 'Save 50%', popular: true },
        { id: 'lifetime', name: 'Lifetime', price: '$79.99', period: 'one-time', savings: 'Best Value' },
      ];
      setPricingPlans(mockPlans);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle purchase flow
   */
  const handlePurchase = async () => {
    try {
      setIsPurchasing(true);

      console.log('[Paywall] Purchase initiated');
      console.log('[Paywall] Selected plan ID:', selectedPlan);
      console.log('[Paywall] Available plans:', pricingPlans.map(p => p.id));

      const selectedOffering = pricingPlans.find(p => p.id === selectedPlan);

      if (!selectedOffering) {
        console.error('[Paywall] Could not find selected plan in pricingPlans array');
        console.error('[Paywall] selectedPlan:', selectedPlan);
        console.error('[Paywall] pricingPlans:', pricingPlans);
        Alert.alert('Error', 'Please select a plan');
        return;
      }

      console.log('[Paywall] Found selected offering:', selectedOffering);

      // Attempt purchase
      const result = await subscriptionManager.purchasePro(selectedOffering.id);

      if (result.success) {
        // Update local tier
        await subscriptionManager.updateLocalTier(UserTier.PRO);

        // Show success message
        Alert.alert(
          'Welcome to Pro!',
          'Your subscription is now active. Enjoy unlimited scans, compression, and more!',
          [
            {
              text: 'Get Started',
              onPress: () => {
                // Navigate back to previous screen
                navigation.goBack();
              },
            },
          ]
        );
      } else {
        // Purchase failed
        throw new Error(result.error || 'Purchase failed');
      }
    } catch (err) {
      console.error('Error during purchase:', err);

      // Check if it's a RevenueCat not configured error
      if (err instanceof Error && err.message.includes('not configured')) {
        // For development: Allow upgrading to Pro locally
        Alert.alert(
          'Development Mode',
          'RevenueCat is not configured yet. Upgrade to Pro locally for testing?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Upgrade Locally',
              onPress: async () => {
                try {
                  await subscriptionManager.updateLocalTier(UserTier.PRO);
                  Alert.alert('Success', 'Upgraded to Pro (local testing mode)');
                  navigation.goBack();
                } catch (localErr) {
                  Alert.alert('Error', 'Failed to upgrade locally');
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Purchase Failed',
          err instanceof Error ? err.message : 'Unable to complete purchase. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  /**
   * Handle restore purchases
   */
  const handleRestorePurchases = async () => {
    try {
      setIsRestoring(true);

      const result = await subscriptionManager.restorePurchases();

      if (result.success && result.customerInfo) {
        // Check if user has Pro entitlement
        // RevenueCat will automatically update the subscription status
        await subscriptionManager.updateLocalTier(UserTier.PRO);

        Alert.alert(
          'Purchases Restored!',
          'Your Pro subscription has been restored.',
          [
            {
              text: 'Continue',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We couldn\'t find any previous purchases to restore.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('Error restoring purchases:', err);

      // Check if it's a RevenueCat not configured error
      if (err instanceof Error && err.message.includes('not configured')) {
        Alert.alert(
          'Development Mode',
          'RevenueCat is not configured. Purchase restoration is only available in production.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Restore Failed',
          err instanceof Error ? err.message : 'Unable to restore purchases. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsRestoring(false);
    }
  };

  // Load pricing plans on mount
  useEffect(() => {
    loadPricingPlans();
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <LoadingSpinner size="large" label="Loading plans..." />
      </View>
    );
  }

  // Show error state (with fallback to mock data)
  if (error && pricingPlans.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        <ErrorState
          title="Failed to Load Plans"
          message={error}
          onRetry={loadPricingPlans}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="bg-blue-600 pt-6 pb-8 px-6">
          <Text className="text-white text-3xl font-bold mb-2">
            Upgrade to Pro
          </Text>
          <Text className="text-blue-100 text-base">
            Unlock unlimited scans, compression, and more
          </Text>
        </View>

        {/* Feature Comparison */}
        <View className="bg-white mx-4 mt-4 rounded-xl shadow-sm overflow-hidden">
          <View className="p-4 border-b border-gray-200">
            <Text className="font-bold text-lg text-gray-800">Pro Features</Text>
          </View>

          {/* Feature List */}
          <View className="p-4">
            <FeatureRow
              title="Unlimited Scans"
              free="3 per month"
              pro="Unlimited"
            />
            <FeatureRow
              title="Duplicate Cleanup"
              free="50 photos/month"
              pro="Unlimited"
            />
            <FeatureRow
              title="Photo Compression"
              free="❌"
              pro="✅"
            />
            <FeatureRow
              title="Video Compression"
              free="❌"
              pro="✅"
            />
            <FeatureRow
              title="AI Quality Scoring"
              free="❌"
              pro="✅"
            />
            <FeatureRow
              title="Background Scanning"
              free="❌"
              pro="✅"
            />
            <FeatureRow
              title="Cloud Sync"
              free="❌"
              pro="✅"
            />
            <FeatureRow
              title="Priority Support"
              free="❌"
              pro="✅"
              isLast
            />
          </View>
        </View>

        {/* Pricing Plans */}
        <View className="mx-4 mt-4">
          <Text className="font-bold text-lg text-gray-800 mb-3">
            Choose Your Plan
          </Text>

          {pricingPlans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              onPress={() => setSelectedPlan(plan.id)}
              className={`mb-3 rounded-xl overflow-hidden ${
                selectedPlan === plan.id
                  ? 'border-2 border-blue-600'
                  : 'border border-gray-300'
              }`}
            >
              <View className="bg-white p-4">
                <View className="flex-row justify-between items-center">
                  <View className="flex-1">
                    <View className="flex-row items-center mb-1">
                      <Text className="font-bold text-gray-800 text-lg">
                        {plan.name}
                      </Text>
                      {plan.popular && (
                        <View className="ml-2 bg-blue-600 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs font-bold">POPULAR</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-gray-500 text-sm">{plan.period}</Text>
                    {plan.savings && (
                      <Text className="text-green-600 font-semibold text-sm mt-1">
                        {plan.savings}
                      </Text>
                    )}
                  </View>
                  <View className="items-end">
                    <Text className="font-bold text-gray-800 text-2xl">
                      {plan.price}
                    </Text>
                    {plan.id === 'yearly' && (
                      <Text className="text-gray-500 text-xs">$2.49/month</Text>
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Benefits */}
        <View className="mx-4 mt-4 mb-6">
          <Text className="font-bold text-lg text-gray-800 mb-3">
            Why Go Pro?
          </Text>
          <View className="bg-white rounded-xl shadow-sm p-4">
            <BenefitItem
              icon="🚀"
              title="Save More Space"
              description="Compress photos and videos without losing quality"
            />
            <BenefitItem
              icon="🤖"
              title="Smart Recommendations"
              description="AI automatically selects the best photos to keep"
            />
            <BenefitItem
              icon="⏰"
              title="Set It & Forget It"
              description="Background scanning keeps your library organized"
            />
            <BenefitItem
              icon="☁️"
              title="Sync Across Devices"
              description="Your preferences and decisions synced everywhere"
              isLast
            />
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="bg-white border-t border-gray-200 p-4">
        <TouchableOpacity
          onPress={handlePurchase}
          className="bg-blue-600 py-4 rounded-xl mb-2"
          disabled={isPurchasing}
        >
          {isPurchasing ? (
            <View className="flex-row justify-center items-center">
              <ActivityIndicator color="white" />
              <Text className="text-white font-bold text-lg ml-2">Processing...</Text>
            </View>
          ) : (
            <>
              <Text className="text-white text-center font-bold text-lg">
                Start Pro Trial
              </Text>
              <Text className="text-blue-100 text-center text-sm">
                7 days free, then{' '}
                {pricingPlans.find(p => p.id === selectedPlan)?.price}{' '}
                {pricingPlans.find(p => p.id === selectedPlan)?.period}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center space-x-4">
          <TouchableOpacity
            onPress={handleRestorePurchases}
            disabled={isRestoring || isPurchasing}
          >
            <Text className={`text-sm ${isRestoring ? 'text-gray-300' : 'text-gray-500'}`}>
              {isRestoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            disabled={isPurchasing || isRestoring}
          >
            <Text className="text-gray-500 text-sm">Maybe Later</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-gray-400 text-xs text-center mt-3">
          Cancel anytime. Auto-renews unless canceled 24 hours before period ends.
        </Text>
      </View>
    </View>
  );
}

// Helper Component: Feature Row
type FeatureRowProps = {
  title: string;
  free: string;
  pro: string;
  isLast?: boolean;
};

function FeatureRow({ title, free, pro, isLast }: FeatureRowProps) {
  return (
    <View className={`flex-row justify-between py-3 ${!isLast ? 'border-b border-gray-100' : ''}`}>
      <Text className="flex-1 text-gray-700">{title}</Text>
      <View className="flex-row w-32 justify-between">
        <View className="w-14 items-center">
          <Text className="text-gray-400 text-sm">{free}</Text>
        </View>
        <View className="w-14 items-center">
          <Text className="text-blue-600 font-semibold text-sm">{pro}</Text>
        </View>
      </View>
    </View>
  );
}

// Helper Component: Benefit Item
type BenefitItemProps = {
  icon: string;
  title: string;
  description: string;
  isLast?: boolean;
};

function BenefitItem({ icon, title, description, isLast }: BenefitItemProps) {
  return (
    <View className={`flex-row ${!isLast ? 'mb-4' : ''}`}>
      <Text className="text-3xl mr-3">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-gray-800 mb-1">{title}</Text>
        <Text className="text-sm text-gray-600">{description}</Text>
      </View>
    </View>
  );
}
