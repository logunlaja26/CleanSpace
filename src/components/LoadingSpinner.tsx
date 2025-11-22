/**
 * LoadingSpinner Component
 *
 * A consistent loading indicator for async operations.
 * Supports different sizes and optional labels.
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';

type SpinnerSize = 'small' | 'default' | 'large';

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Optional text to display below the spinner */
  label?: string;
  /** Color of the spinner (defaults to primary) */
  color?: string;
  /** Whether to display full-screen centered */
  fullScreen?: boolean;
}

const sizeMap: Record<SpinnerSize, 'small' | 'large'> = {
  small: 'small',
  default: 'large',
  large: 'large',
};

const scaleFactor: Record<SpinnerSize, number> = {
  small: 0.8,
  default: 1,
  large: 1.5,
};

export function LoadingSpinner({
  size = 'default',
  label,
  color = colors.primary.default,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const content = (
    <View style={styles.container}>
      <ActivityIndicator
        size={sizeMap[size]}
        color={color}
        style={{ transform: [{ scale: scaleFactor[size] }] }}
      />
      {label && (
        <Text style={[styles.label, { color: colors.text.secondary }]}>
          {label}
        </Text>
      )}
    </View>
  );

  if (fullScreen) {
    return <View style={styles.fullScreen}>{content}</View>;
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ui.screenBackground,
  },
  label: {
    marginTop: spacing[3],
    ...typography.body.small,
  },
});

export default LoadingSpinner;
