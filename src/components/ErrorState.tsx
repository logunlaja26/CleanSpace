/**
 * ErrorState Component
 *
 * Displays error messages with optional retry action.
 * Used for permission denied, network errors, database errors, etc.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography, layout } from '../theme';

type ErrorType = 'generic' | 'permission' | 'network' | 'notFound';

interface ErrorStateProps {
  /** Type of error (affects icon and default message) */
  type?: ErrorType;
  /** Custom title (overrides default) */
  title?: string;
  /** Custom message (overrides default) */
  message?: string;
  /** Retry action */
  onRetry?: () => void;
  /** Custom retry label */
  retryLabel?: string;
  /** Secondary action (e.g., "Go to Settings") */
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  /** Whether to display full-screen */
  fullScreen?: boolean;
}

const errorDefaults: Record<ErrorType, { icon: string; title: string; message: string }> = {
  generic: {
    icon: '!',
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
  },
  permission: {
    icon: '!',
    title: 'Permission Required',
    message: 'Please grant access to your photo library to use this feature.',
  },
  network: {
    icon: '!',
    title: 'No Connection',
    message: 'Please check your internet connection and try again.',
  },
  notFound: {
    icon: '?',
    title: 'Not Found',
    message: 'The content you\'re looking for doesn\'t exist.',
  },
};

export function ErrorState({
  type = 'generic',
  title,
  message,
  onRetry,
  retryLabel = 'Try Again',
  secondaryAction,
  fullScreen = true,
}: ErrorStateProps) {
  const defaults = errorDefaults[type];

  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{defaults.icon}</Text>
      </View>
      <Text style={styles.title}>{title || defaults.title}</Text>
      <Text style={styles.message}>{message || defaults.message}</Text>

      <View style={styles.actions}>
        {onRetry && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onRetry}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>{retryLabel}</Text>
          </TouchableOpacity>
        )}
        {secondaryAction && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={secondaryAction.onPress}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>
              {secondaryAction.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.ui.screenBackground,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.error.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[6],
  },
  icon: {
    fontSize: 40,
    color: colors.error.default,
  },
  title: {
    ...typography.heading.h3,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  message: {
    ...typography.body.default,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: spacing[6],
  },
  actions: {
    width: '100%',
    maxWidth: 300,
    gap: spacing[3],
  },
  primaryButton: {
    backgroundColor: colors.primary.default,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: layout.borderRadius.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.button.default,
    color: colors.text.inverse,
  },
  secondaryButton: {
    backgroundColor: colors.neutral.disabled,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: layout.borderRadius.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.button.default,
    color: colors.text.primary,
  },
});

export default ErrorState;
