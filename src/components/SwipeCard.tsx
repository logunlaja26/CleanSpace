import React, { useRef, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

// Types
import type { SwipeCardProps } from '../types/swipe';

// Theme
import { colors, spacingAliases as spacing } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SWIPE_THRESHOLD = 120; // Pixels to swipe before action triggers
const VELOCITY_THRESHOLD = 0.7; // Velocity threshold for fast swipes

/**
 * SwipeCard Component
 *
 * Individual swipeable card with PanResponder for gesture handling.
 * Supports swipe left (trash) and swipe right (keep) gestures.
 * Supports both photos and videos with appropriate visual indicators.
 * Includes visual feedback overlays and smooth animations.
 */
export default function SwipeCard({
  item,
  mediaType,
  onSwipeLeft,
  onSwipeRight,
  isTopCard,
  zIndex,
}: SwipeCardProps) {
  // Animated values for card position and rotation
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Track if card is currently being swiped
  const isSwiping = useRef(false);

  /**
   * Pan responder for gesture handling
   */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTopCard,
      onMoveShouldSetPanResponder: () => isTopCard,

      onPanResponderGrant: () => {
        // Haptic feedback on touch start
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        isSwiping.current = true;
      },

      onPanResponderMove: (_, gesture) => {
        if (!isTopCard) return;

        // Update position to follow finger
        position.setValue({ x: gesture.dx, y: gesture.dy });

        // Calculate rotation based on horizontal movement
        // Rotation range: -30deg to +30deg
        const rotationValue = gesture.dx / SCREEN_WIDTH;
        rotate.setValue(rotationValue);
      },

      onPanResponderRelease: (_, gesture) => {
        isSwiping.current = false;

        if (!isTopCard) return;

        // Determine if swipe threshold was met
        const swipeDistance = Math.abs(gesture.dx);
        const swipeVelocity = Math.abs(gesture.vx);
        const isHorizontalSwipe = Math.abs(gesture.dx) > Math.abs(gesture.dy);

        const shouldSwipe =
          (swipeDistance > SWIPE_THRESHOLD || swipeVelocity > VELOCITY_THRESHOLD) &&
          isHorizontalSwipe;

        if (shouldSwipe) {
          // Determine swipe direction
          const direction = gesture.dx > 0 ? 'right' : 'left';

          // Medium haptic feedback on swipe commit
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

          // Animate card exit
          forceSwipe(direction);
        } else {
          // Reset to center with spring animation
          resetPosition();
        }
      },

      onPanResponderTerminate: () => {
        isSwiping.current = false;
        resetPosition();
      },
    })
  ).current;

  /**
   * Animate card back to center position
   */
  const resetPosition = () => {
    Animated.parallel([
      Animated.spring(position, {
        toValue: { x: 0, y: 0 },
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: 0,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

  /**
   * Force swipe animation in specified direction
   */
  const forceSwipe = (direction: 'left' | 'right') => {
    const targetX = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;

    Animated.parallel([
      Animated.timing(position, {
        toValue: { x: targetX, y: 0 },
        duration: 300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Call appropriate callback after animation completes
      if (direction === 'left') {
        onSwipeLeft(item.id);
      } else {
        onSwipeRight(item.id);
      }
    });
  };

  /**
   * Get card rotation interpolation
   */
  const getCardRotation = () => {
    return rotate.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: ['-30deg', '0deg', '30deg'],
    });
  };

  /**
   * Get left overlay opacity (trash indicator)
   */
  const getLeftOverlayOpacity = () => {
    return position.x.interpolate({
      inputRange: [-SCREEN_WIDTH / 2, -50, 0],
      outputRange: [1, 0.5, 0],
      extrapolate: 'clamp',
    });
  };

  /**
   * Get right overlay opacity (keep indicator)
   */
  const getRightOverlayOpacity = () => {
    return position.x.interpolate({
      inputRange: [0, 50, SCREEN_WIDTH / 2],
      outputRange: [0, 0.5, 1],
      extrapolate: 'clamp',
    });
  };

  /**
   * Get animated card style
   */
  const getCardStyle = () => {
    return {
      transform: [
        { translateX: position.x },
        { translateY: position.y },
        { rotate: getCardRotation() },
      ],
      opacity,
      zIndex,
    };
  };

  /**
   * Trigger swipe programmatically (for button controls)
   */
  useEffect(() => {
    // This effect allows parent component to trigger swipes via ref
    // Implementation can be added if needed
  }, []);

  // Helper to format file size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Helper to format video duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.cardContainer, getCardStyle()]}
    >
      {/* Main card content */}
      <View style={styles.card}>
        {/* Media image/thumbnail */}
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Video play icon overlay (center) */}
        {mediaType === 'video' && (
          <View style={styles.playIconOverlay}>
            <Ionicons name="play-circle" size={80} color="white" style={{ opacity: 0.9 }} />
          </View>
        )}

        {/* Video duration badge (top-right) */}
        {mediaType === 'video' && 'duration' in item && item.duration !== undefined && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
        )}

        {/* Media info overlay at bottom */}
        <View style={styles.infoOverlay}>
          <Text style={styles.filename} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={styles.fileSize}>{formatBytes(item.file_size)}</Text>
        </View>

        {/* Left swipe overlay (Trash) */}
        <Animated.View
          style={[
            styles.swipeOverlay,
            styles.leftOverlay,
            { opacity: getLeftOverlayOpacity() },
          ]}
        >
          <View style={styles.overlayContent}>
            <Ionicons name="trash" size={60} color="#fff" />
            <Text style={styles.overlayText}>DELETE</Text>
          </View>
        </Animated.View>

        {/* Right swipe overlay (Keep) */}
        <Animated.View
          style={[
            styles.swipeOverlay,
            styles.rightOverlay,
            { opacity: getRightOverlayOpacity() },
          ]}
        >
          <View style={styles.overlayContent}>
            <Ionicons name="checkmark-circle" size={60} color="#fff" />
            <Text style={styles.overlayText}>KEEP</Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    width: SCREEN_WIDTH - spacing.xl * 2,
    height: SCREEN_HEIGHT * 0.7,
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.neutral.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  playIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    pointerEvents: 'none', // Allow touches to pass through
  },
  durationBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  durationText: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: '700',
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: spacing.md,
  },
  filename: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.inverse,
    marginBottom: spacing.xs,
  },
  fileSize: {
    fontSize: 14,
    color: colors.text.inverse,
    opacity: 0.8,
  },
  swipeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftOverlay: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)', // Red
  },
  rightOverlay: {
    backgroundColor: 'rgba(34, 197, 94, 0.9)', // Green
  },
  overlayContent: {
    alignItems: 'center',
  },
  overlayText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: spacing.md,
    letterSpacing: 2,
  },
});
