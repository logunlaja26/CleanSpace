/**
 * Badge Component
 *
 * Small label for status indicators, tier badges, and category tags.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, spacing, typography, layout } from '../theme';

type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'pro'
  | 'free'
  | 'duplicates'
  | 'largeFiles'
  | 'screenshots';

type BadgeSize = 'small' | 'default';

interface BadgeProps {
  /** Badge text */
  label: string;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
  /** Custom style */
  style?: ViewStyle;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  primary: {
    bg: colors.primary.lighter,
    text: colors.primary.dark,
  },
  secondary: {
    bg: colors.neutral.disabled,
    text: colors.text.secondary,
  },
  success: {
    bg: colors.success.light,
    text: colors.success.dark,
  },
  warning: {
    bg: colors.warning.light,
    text: colors.warning.dark,
  },
  danger: {
    bg: colors.error.light,
    text: colors.error.default,
  },
  pro: {
    bg: colors.tier.pro.background,
    text: colors.tier.pro.text,
  },
  free: {
    bg: colors.tier.free.background,
    text: colors.tier.free.text,
  },
  duplicates: {
    bg: colors.category.duplicates.background,
    text: colors.category.duplicates.text,
  },
  largeFiles: {
    bg: colors.category.largeFiles.background,
    text: colors.category.largeFiles.text,
  },
  screenshots: {
    bg: colors.category.screenshots.background,
    text: colors.category.screenshots.text,
  },
};

export function Badge({
  label,
  variant = 'primary',
  size = 'default',
  style,
}: BadgeProps) {
  const { bg, text } = variantStyles[variant];

  const containerStyle: ViewStyle[] = [
    styles.container,
    size === 'small' && styles.containerSmall,
    { backgroundColor: bg },
    style,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.text,
    size === 'small' && styles.textSmall,
    { color: text },
  ].filter(Boolean) as TextStyle[];

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

/**
 * TierBadge - Specialized badge for subscription tier
 */
interface TierBadgeProps {
  tier: 'free' | 'pro';
  size?: BadgeSize;
  style?: ViewStyle;
}

export function TierBadge({ tier, size = 'default', style }: TierBadgeProps) {
  return (
    <Badge
      label={tier.toUpperCase()}
      variant={tier}
      size={size}
      style={style}
    />
  );
}

/**
 * ProOnlyBadge - Badge indicating a Pro-only feature
 */
interface ProOnlyBadgeProps {
  size?: BadgeSize;
  style?: ViewStyle;
}

export function ProOnlyBadge({ size = 'small', style }: ProOnlyBadgeProps) {
  return (
    <Badge
      label="PRO ONLY"
      variant="primary"
      size={size}
      style={style}
    />
  );
}

/**
 * SavingsBadge - Badge showing potential savings
 */
interface SavingsBadgeProps {
  amount: string;
  size?: BadgeSize;
  style?: ViewStyle;
}

export function SavingsBadge({ amount, size = 'default', style }: SavingsBadgeProps) {
  return (
    <Badge
      label={amount}
      variant="danger"
      size={size}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: layout.borderRadius.full,
    alignSelf: 'flex-start',
  },
  containerSmall: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing['0.5'],
  },
  text: {
    ...typography.special.badge,
  },
  textSmall: {
    fontSize: 10,
  },
});

export default Badge;
