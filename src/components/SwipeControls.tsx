import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// Types
import type { SwipeControlsProps } from '../types/swipe';

// Theme
import { colors, spacingAliases as spacing } from '../theme';

/**
 * SwipeControls Component
 *
 * Alternative tap buttons for trash (left) and keep (right) actions.
 * Provides non-gesture interaction option for users who prefer tapping.
 * Positioned above the TrashQueuePanel.
 */
export default function SwipeControls({
  onTrash,
  onKeep,
  disabled,
}: SwipeControlsProps) {
  const handleTrash = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onTrash();
  };

  const handleKeep = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onKeep();
  };

  return (
    <View style={styles.container}>
      {/* Trash button (left) */}
      <TouchableOpacity
        style={[
          styles.button,
          styles.trashButton,
          disabled && styles.buttonDisabled,
        ]}
        onPress={handleTrash}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Ionicons
          name="close-circle"
          size={48}
          color={disabled ? colors.neutral.disabled : '#fff'}
        />
      </TouchableOpacity>

      {/* Keep button (right) */}
      <TouchableOpacity
        style={[
          styles.button,
          styles.keepButton,
          disabled && styles.buttonDisabled,
        ]}
        onPress={handleKeep}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Ionicons
          name="checkmark-circle"
          size={48}
          color={disabled ? colors.neutral.disabled : '#fff'}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 140, // Above TrashQueuePanel (adjust as needed)
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.xl * 2,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  trashButton: {
    backgroundColor: colors.error.default,
  },
  keepButton: {
    backgroundColor: colors.success.default,
  },
  buttonDisabled: {
    backgroundColor: colors.neutral.disabled,
    opacity: 0.5,
  },
});
