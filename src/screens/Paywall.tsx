import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

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

const mockPricingPlans: PricingPlan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$4.99',
    period: '/month',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '$29.99',
    period: '/year',
    savings: 'Save 50%',
    popular: true,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '$79.99',
    period: 'one-time',
    savings: 'Best Value',
  },
];

export default function Paywall({ navigation }: PaywallProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('yearly');

  const handlePurchase = () => {
    // In real implementation, this would trigger RevenueCat purchase
    console.log(`Purchasing ${selectedPlan} plan`);
  };

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

          {mockPricingPlans.map((plan) => (
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
        >
          <Text className="text-white text-center font-bold text-lg">
            Start Pro Trial
          </Text>
          <Text className="text-blue-100 text-center text-sm">
            7 days free, then{' '}
            {mockPricingPlans.find(p => p.id === selectedPlan)?.price}{' '}
            {mockPricingPlans.find(p => p.id === selectedPlan)?.period}
          </Text>
        </TouchableOpacity>

        <View className="flex-row justify-center space-x-4">
          <TouchableOpacity>
            <Text className="text-gray-500 text-sm">Restore Purchases</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
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
