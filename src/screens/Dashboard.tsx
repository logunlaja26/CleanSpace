import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Button, Badge, SavingsBadge, LoadingSpinner } from '../components';
import { colors, spacing, typography, layout } from '../theme';

type DashboardProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

// Mock data for initial development
const mockData = {
  totalPhotos: 5420,
  totalSize: '12.3 GB',
  freeSpace: '6.8 GB',
  duplicateGroups: 47,
  potentialSavings: '2.1 GB',
  largeFilesCount: 128,
  screenshotsCount: 342,
  lastScan: '2 hours ago',
  scansRemaining: 2, // Free tier
  cleanupRemaining: 50,
  tier: 'free' as 'free' | 'pro',
};

export default function Dashboard({ navigation }: DashboardProps) {
  const [isScanning, setIsScanning] = useState(false);

  const handleStartScan = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsScanning(true);
    // Simulate scan - will be replaced with real PhotoScanner service
    setTimeout(() => setIsScanning(false), 2000);
  };

  const handleQuickAction = async (screen: keyof RootStackParamList) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(screen);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Free Tier Usage Banner */}
      {mockData.tier === 'free' && (
        <TouchableOpacity
          onPress={() => handleQuickAction('Paywall')}
          className="bg-blue-600 p-4 m-4 rounded-xl"
          activeOpacity={0.8}
        >
          <Text className="text-white font-bold text-center mb-1">
            Free Plan: {mockData.scansRemaining} scans remaining this month
          </Text>
          <Text className="text-blue-100 text-center text-sm">
            Tap to upgrade to Pro for unlimited scans
          </Text>
        </TouchableOpacity>
      )}

      {/* Storage Overview Card - Using new Card component style */}
      <View className="bg-white m-4 p-6 rounded-xl" style={layout.shadow.default}>
        <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing[4] }]}>
          Storage Overview
        </Text>
        <View className="flex-row justify-between mb-3">
          <Text style={[typography.body.default, { color: colors.text.secondary }]}>Total Photos</Text>
          <Text style={[typography.label.large, { color: colors.text.primary }]}>
            {mockData.totalPhotos.toLocaleString()}
          </Text>
        </View>
        <View className="flex-row justify-between mb-3">
          <Text style={[typography.body.default, { color: colors.text.secondary }]}>Total Size</Text>
          <Text style={[typography.label.large, { color: colors.text.primary }]}>{mockData.totalSize}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text style={[typography.body.default, { color: colors.text.secondary }]}>Free Space</Text>
          <Text style={[typography.label.large, { color: colors.success.default }]}>{mockData.freeSpace}</Text>
        </View>
      </View>

      {/* Potential Savings Card */}
      <View
        className="m-4 p-6 rounded-xl"
        style={{ backgroundColor: colors.success.default }}
      >
        <Text style={[typography.heading.h4, { color: colors.text.inverse, marginBottom: spacing[2] }]}>
          Potential Savings
        </Text>
        <Text style={[typography.special.displayNumber, { color: colors.text.inverse, marginBottom: spacing[1] }]}>
          {mockData.potentialSavings}
        </Text>
        <Text style={[typography.body.small, { color: colors.success.light }]}>
          Based on {mockData.duplicateGroups} duplicate groups found
        </Text>
      </View>

      {/* Quick Action Cards */}
      <View className="mx-4 mb-4">
        <Text style={[typography.heading.h4, { color: colors.text.primary, marginBottom: spacing[3] }]}>
          Quick Actions
        </Text>

        {/* Duplicates Card - Using themed styles */}
        <QuickActionCard
          title="Duplicate Photos"
          subtitle={`${mockData.duplicateGroups} groups found`}
          badge={<SavingsBadge amount={mockData.potentialSavings} />}
          onPress={() => handleQuickAction('Duplicates')}
        />

        {/* Large Files Card */}
        <QuickActionCard
          title="Large Files"
          subtitle={`${mockData.largeFilesCount} files over 5MB`}
          badge={<Badge label="Review" variant="largeFiles" />}
          onPress={() => handleQuickAction('LargeFiles')}
        />

        {/* Screenshots Card */}
        <QuickActionCard
          title="Screenshots"
          subtitle={`${mockData.screenshotsCount} screenshots found`}
          badge={<Badge label="Clean" variant="screenshots" />}
          onPress={() => handleQuickAction('Screenshots')}
        />

        {/* Photo Library Card */}
        <QuickActionCard
          title="All Photos"
          subtitle={`Browse all ${mockData.totalPhotos.toLocaleString()} photos`}
          badge={<Badge label="View" variant="primary" />}
          onPress={() => handleQuickAction('PhotoLibrary')}
        />
      </View>

      {/* Start Scan Button - Using new Button component */}
      <View className="m-4">
        {isScanning ? (
          <View
            className="rounded-xl p-4"
            style={{ backgroundColor: colors.primary.default }}
          >
            <LoadingSpinner color={colors.text.inverse} label="Scanning your library..." />
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleStartScan}
            className="rounded-xl p-4"
            style={[{ backgroundColor: colors.primary.default }, layout.shadow.md]}
            activeOpacity={0.8}
          >
            <Text style={[typography.button.large, { color: colors.text.inverse, textAlign: 'center' }]}>
              Start New Scan
            </Text>
            <Text style={[typography.body.small, { color: colors.primary.lighter, textAlign: 'center', marginTop: spacing[1] }]}>
              Last scan: {mockData.lastScan}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Settings Link */}
      <View className="m-4 mb-8">
        <Button
          label="Settings & Preferences"
          variant="link"
          onPress={() => handleQuickAction('Settings')}
        />
      </View>
    </ScrollView>
  );
}

/**
 * QuickActionCard - Reusable card for quick actions
 */
interface QuickActionCardProps {
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  onPress: () => void;
}

function QuickActionCard({ title, subtitle, badge, onPress }: QuickActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white p-4 rounded-xl mb-3"
      style={({ pressed }) => [
        layout.shadow.default,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View className="flex-row justify-between items-center">
        <View style={{ flex: 1 }}>
          <Text style={[typography.label.large, { color: colors.text.primary }]}>
            {title}
          </Text>
          <Text style={[typography.body.small, { color: colors.text.tertiary, marginTop: spacing[1] }]}>
            {subtitle}
          </Text>
        </View>
        {badge}
      </View>
    </Pressable>
  );
}
