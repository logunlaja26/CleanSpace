import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// Types
import type { TrashQueuePanelProps } from '../types/swipe';

// Components
import { Button, Badge } from './index';

// Theme
import { colors, spacingAliases as spacing } from '../theme';

/**
 * TrashQueuePanel Component
 *
 * Bottom-fixed panel showing trash queue count and empty trash button.
 * Displays a trash icon with badge count and a prominent action button.
 */
export default function TrashQueuePanel({
  trashCount,
  onEmptyTrash,
  isProcessing,
}: TrashQueuePanelProps) {
  const handleTrashPress = () => {
    if (trashCount === 0) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleEmptyTrash = () => {
    if (trashCount === 0 || isProcessing) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onEmptyTrash();
  };

  return (
    <View style={styles.container}>
      {/* Trash icon with count badge */}
      <TouchableOpacity
        style={styles.trashIconContainer}
        onPress={handleTrashPress}
        disabled={trashCount === 0}
        activeOpacity={0.7}
      >
        <View>
          <Ionicons
            name={trashCount > 0 ? 'trash' : 'trash-outline'}
            size={32}
            color={trashCount > 0 ? colors.error.default : colors.neutral.disabled}
          />
          {trashCount > 0 && (
            <View style={styles.badgeContainer}>
              <Badge
                variant="danger"
                size="small"
                label={trashCount > 99 ? '99+' : trashCount.toString()}
              />
            </View>
          )}
        </View>
        {trashCount > 0 && (
          <Text style={styles.trashLabel}>
            {trashCount} item{trashCount > 1 ? 's' : ''}
          </Text>
        )}
      </TouchableOpacity>

      {/* Empty trash button */}
      <View style={styles.buttonContainer}>
        <Button
          variant="danger"
          size="large"
          onPress={handleEmptyTrash}
          disabled={trashCount === 0 || isProcessing}
          loading={isProcessing}
          fullWidth
          label={isProcessing ? 'Deleting...' : 'Empty Trash'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.neutral.surface,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl, // Extra padding for safe area
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  trashIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  trashLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  buttonContainer: {
    width: '100%',
  },
});
