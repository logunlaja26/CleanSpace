import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Types
import type { SwipeTutorialOverlayProps } from '../types/swipe';

// Components
import { Button } from './index';

// Theme
import { colors, spacingAliases as spacing } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

/**
 * SwipeTutorialOverlay Component
 *
 * First-time tutorial overlay explaining swipe gestures.
 * Shows split-screen illustration with left (trash) and right (keep) actions.
 * Includes animated instructions and dismiss button.
 */
export default function SwipeTutorialOverlay({
  visible,
  onDismiss,
}: SwipeTutorialOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in on mount
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, fadeAnim]);

  const handleDismiss = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        {/* Close button (top-right) */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle" size={32} color="#fff" />
        </TouchableOpacity>

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.title}>How to Use Swipe Mode</Text>

          {/* Split-screen illustration */}
          <View style={styles.illustrationContainer}>
            {/* Left side (Trash) */}
            <View style={[styles.side, styles.leftSide]}>
              <View style={styles.iconContainer}>
                <Ionicons name="arrow-back" size={32} color="#fff" />
                <Ionicons name="trash" size={60} color="#fff" style={styles.actionIcon} />
              </View>
              <Text style={styles.sideLabel}>Swipe Left</Text>
              <Text style={styles.sideDescription}>Mark as trash</Text>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Right side (Keep) */}
            <View style={[styles.side, styles.rightSide]}>
              <View style={styles.iconContainer}>
                <Ionicons name="checkmark-circle" size={60} color="#fff" style={styles.actionIcon} />
                <Ionicons name="arrow-forward" size={32} color="#fff" />
              </View>
              <Text style={styles.sideLabel}>Swipe Right</Text>
              <Text style={styles.sideDescription}>Keep this photo</Text>
            </View>
          </View>

          {/* Additional tips */}
          <View style={styles.tipsContainer}>
            <View style={styles.tip}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary.default} />
              <Text style={styles.tipText}>
                Photos are queued for deletion. Tap "Empty Trash" to confirm.
              </Text>
            </View>
            <View style={styles.tip}>
              <Ionicons name="refresh-outline" size={20} color={colors.primary.default} />
              <Text style={styles.tipText}>
                Use the "Undo" button to reverse your last action.
              </Text>
            </View>
          </View>

          {/* Got it button */}
          <Button
            variant="primary"
            size="large"
            onPress={handleDismiss}
            fullWidth
            label="Got It!"
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl + 40, // Account for status bar
    right: spacing.xl,
    zIndex: 10,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.neutral.surface,
    borderRadius: 16,
    padding: spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  illustrationContainer: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    borderRadius: 12,
    overflow: 'hidden',
    height: 180,
  },
  side: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  leftSide: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)', // Red
  },
  rightSide: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)', // Green
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  actionIcon: {
    marginHorizontal: spacing.sm,
  },
  sideLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: spacing.xs,
  },
  sideDescription: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  divider: {
    width: 2,
    backgroundColor: '#fff',
    opacity: 0.3,
  },
  tipsContainer: {
    marginBottom: spacing.xl,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
