/**
 * ProgressBar Component
 *
 * A customizable progress indicator for showing scan progress,
 * storage usage, or any percentage-based visualization.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, layout } from '../theme';

type ProgressVariant = 'primary' | 'success' | 'warning' | 'danger';
type ProgressSize = 'small' | 'default' | 'large';

interface ProgressBarProps {
  /** Progress value (0-100) */
  progress: number;
  /** Visual variant */
  variant?: ProgressVariant;
  /** Size of the progress bar */
  size?: ProgressSize;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: 'inside' | 'right' | 'below';
  /** Custom label format function */
  formatLabel?: (progress: number) => string;
  /** Animate progress changes */
  animated?: boolean;
  /** Custom style */
  style?: ViewStyle;
}

const variantColors: Record<ProgressVariant, string> = {
  primary: colors.primary.default,
  success: colors.success.default,
  warning: colors.warning.default,
  danger: colors.error.default,
};

const sizeHeights: Record<ProgressSize, number> = {
  small: 4,
  default: 8,
  large: 12,
};

export function ProgressBar({
  progress,
  variant = 'primary',
  size = 'default',
  showLabel = false,
  labelPosition = 'right',
  formatLabel = (p) => `${Math.round(p)}%`,
  animated = true,
  style,
}: ProgressBarProps) {
  // Clamp progress between 0 and 100
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const barColor = variantColors[variant];
  const barHeight = sizeHeights[size];

  const renderLabel = () => {
    if (!showLabel) return null;

    return (
      <Text
        style={[
          styles.label,
          labelPosition === 'inside' && styles.labelInside,
          labelPosition === 'below' && styles.labelBelow,
        ]}
      >
        {formatLabel(clampedProgress)}
      </Text>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <View
          style={[
            styles.track,
            { height: barHeight, borderRadius: barHeight / 2 },
          ]}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${clampedProgress}%`,
                backgroundColor: barColor,
                height: barHeight,
                borderRadius: barHeight / 2,
              },
            ]}
          />
          {showLabel && labelPosition === 'inside' && size === 'large' && (
            <View style={styles.insideLabelContainer}>{renderLabel()}</View>
          )}
        </View>
        {showLabel && labelPosition === 'right' && renderLabel()}
      </View>
      {showLabel && labelPosition === 'below' && renderLabel()}
    </View>
  );
}

/**
 * StorageBar - Specialized progress bar for storage visualization
 */
interface StorageBarProps {
  /** Used storage in bytes */
  used: number;
  /** Total storage in bytes */
  total: number;
  /** Format function for size display */
  formatSize?: (bytes: number) => string;
  /** Show labels */
  showLabels?: boolean;
  /** Custom style */
  style?: ViewStyle;
}

const defaultFormatSize = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

export function StorageBar({
  used,
  total,
  formatSize = defaultFormatSize,
  showLabels = true,
  style,
}: StorageBarProps) {
  const progress = total > 0 ? (used / total) * 100 : 0;
  const variant: ProgressVariant =
    progress > 90 ? 'danger' : progress > 75 ? 'warning' : 'primary';

  return (
    <View style={[styles.storageContainer, style]}>
      <ProgressBar progress={progress} variant={variant} size="default" />
      {showLabels && (
        <View style={styles.storageLabels}>
          <Text style={styles.storageLabel}>
            {formatSize(used)} used
          </Text>
          <Text style={styles.storageLabel}>
            {formatSize(total - used)} free
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  track: {
    flex: 1,
    backgroundColor: colors.neutral.disabled,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  insideLabelContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typography.label.small,
    color: colors.text.secondary,
    marginLeft: spacing[2],
  },
  labelInside: {
    color: colors.text.inverse,
    marginLeft: 0,
  },
  labelBelow: {
    marginLeft: 0,
    marginTop: spacing[1],
    textAlign: 'center',
  },
  storageContainer: {},
  storageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[2],
  },
  storageLabel: {
    ...typography.body.small,
    color: colors.text.secondary,
  },
});

export default ProgressBar;
