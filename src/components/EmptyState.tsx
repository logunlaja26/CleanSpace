/**
 * EmptyState Component
 *
 * Displays a friendly message when there's no content to show.
 * Used for empty lists, no search results, no duplicates found, etc.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography, layout } from '../theme';

interface EmptyStateProps {
  /** Icon or emoji to display */
  icon?: string;
  /** Main title */
  title: string;
  /** Descriptive message */
  message?: string;
  /** Optional action button */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Whether to compact the layout */
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {icon && (
        <Text style={[styles.icon, compact && styles.iconCompact]}>{icon}</Text>
      )}
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {message && (
        <Text style={[styles.message, compact && styles.messageCompact]}>
          {message}
        </Text>
      )}
      {action && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  containerCompact: {
    flex: 0,
    padding: spacing[6],
  },
  icon: {
    fontSize: 64,
    marginBottom: spacing[4],
  },
  iconCompact: {
    fontSize: 48,
    marginBottom: spacing[3],
  },
  title: {
    ...typography.heading.h3,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  titleCompact: {
    ...typography.heading.h4,
  },
  message: {
    ...typography.body.default,
    color: colors.text.secondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  messageCompact: {
    ...typography.body.small,
  },
  actionButton: {
    marginTop: spacing[6],
    backgroundColor: colors.primary.default,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: layout.borderRadius.lg,
  },
  actionButtonText: {
    ...typography.button.default,
    color: colors.text.inverse,
  },
});

export default EmptyState;
