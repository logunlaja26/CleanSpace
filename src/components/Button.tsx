/**
 * Button Component
 *
 * A consistent, themeable button with haptic feedback support.
 * Supports multiple variants, sizes, and states.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, layout } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
type ButtonSize = 'small' | 'default' | 'large';

interface ButtonProps {
  /** Button label */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Enable haptic feedback (default: true) */
  haptic?: boolean;
  /** Custom style override */
  style?: ViewStyle;
  /** Custom text style override */
  textStyle?: TextStyle;
}

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: {
      backgroundColor: colors.primary.default,
    },
    text: {
      color: colors.text.inverse,
    },
  },
  secondary: {
    container: {
      backgroundColor: colors.neutral.disabled,
    },
    text: {
      color: colors.text.primary,
    },
  },
  danger: {
    container: {
      backgroundColor: colors.error.light,
    },
    text: {
      color: colors.error.default,
    },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.neutral.border,
    },
    text: {
      color: colors.text.primary,
    },
  },
  link: {
    container: {
      backgroundColor: 'transparent',
    },
    text: {
      color: colors.text.link,
    },
  },
};

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  small: {
    container: {
      height: layout.heights.buttonSmall,
      paddingHorizontal: spacing[3],
      borderRadius: layout.borderRadius.default,
    },
    text: typography.button.small,
  },
  default: {
    container: {
      height: layout.heights.buttonDefault,
      paddingHorizontal: spacing[4],
      borderRadius: layout.borderRadius.lg,
    },
    text: typography.button.default,
  },
  large: {
    container: {
      height: layout.heights.buttonLarge,
      paddingHorizontal: spacing[6],
      borderRadius: layout.borderRadius.lg,
    },
    text: typography.button.large,
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'default',
  disabled = false,
  loading = false,
  fullWidth = false,
  haptic = true,
  style,
  textStyle,
}: ButtonProps) {
  const handlePress = async () => {
    if (haptic) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const containerStyle: ViewStyle[] = [
    styles.container,
    variantStyles[variant].container,
    sizeStyles[size].container,
    fullWidth && styles.fullWidth,
    disabled && styles.disabled,
    style,
  ].filter(Boolean) as ViewStyle[];

  const labelStyle: TextStyle[] = [
    variantStyles[variant].text,
    sizeStyles[size].text,
    disabled && styles.disabledText,
    textStyle,
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.text.inverse : colors.primary.default}
        />
      ) : (
        <Text style={labelStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.7,
  },
});

export default Button;
