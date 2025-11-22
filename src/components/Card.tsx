/**
 * Card Component
 *
 * A consistent container for content sections.
 * Used throughout the app for grouping related content.
 */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, layout } from '../theme';

interface CardProps {
  /** Card content */
  children: ReactNode;
  /** Optional card title */
  title?: string;
  /** Optional right-side header content */
  headerRight?: ReactNode;
  /** Press handler (makes card pressable) */
  onPress?: () => void;
  /** Card padding variant */
  padding?: 'none' | 'small' | 'default' | 'large';
  /** Whether to show shadow */
  shadow?: boolean;
  /** Custom style override */
  style?: ViewStyle;
  /** Enable haptic feedback when pressed (default: true) */
  haptic?: boolean;
}

const paddingMap = {
  none: 0,
  small: spacing[3],
  default: spacing[4],
  large: spacing[6],
};

export function Card({
  children,
  title,
  headerRight,
  onPress,
  padding = 'default',
  shadow = true,
  style,
  haptic = true,
}: CardProps) {
  const handlePress = async () => {
    if (onPress) {
      if (haptic) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      onPress();
    }
  };

  const hasHeader = title || headerRight;

  const cardStyle: ViewStyle[] = [
    styles.container,
    shadow && styles.shadow,
    style,
  ].filter(Boolean) as ViewStyle[];

  const contentStyle: ViewStyle = {
    padding: paddingMap[padding],
  };

  const content = (
    <View style={cardStyle}>
      {hasHeader && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {headerRight}
        </View>
      )}
      <View style={contentStyle}>{children}</View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

/**
 * CardSection - A divider section within a card
 */
interface CardSectionProps {
  children: ReactNode;
  /** Show border at bottom */
  borderBottom?: boolean;
  /** Padding within section */
  padding?: 'none' | 'small' | 'default' | 'large';
  /** Press handler */
  onPress?: () => void;
  /** Custom style */
  style?: ViewStyle;
}

export function CardSection({
  children,
  borderBottom = false,
  padding = 'default',
  onPress,
  style,
}: CardSectionProps) {
  const sectionStyle: ViewStyle[] = [
    { padding: paddingMap[padding] },
    borderBottom && styles.sectionBorder,
    style,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <TouchableOpacity
        style={sectionStyle}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={sectionStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.ui.cardBackground,
    borderRadius: layout.borderRadius.lg,
    overflow: 'hidden',
  },
  shadow: {
    ...layout.shadow.default,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.ui.divider,
  },
  title: {
    ...typography.heading.h4,
    color: colors.text.primary,
  },
  sectionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ui.divider,
  },
});

export default Card;
