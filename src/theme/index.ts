/**
 * CleanSpace Theme System
 *
 * Central export for all design tokens and theme configuration.
 * Import from this file for consistent access to theme values.
 *
 * Usage:
 * - Named imports: import { colors, typography, spacing } from '@/theme'
 * - Full theme: import { theme } from '@/theme'
 */

// Export individual modules
export { colors } from './colors';
export type { ColorPalette, SemanticColors } from './colors';

export {
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacing,
  typography,
} from './typography';
export type { FontSize, FontWeight, LineHeight, Typography } from './typography';

export {
  spacing,
  spacingAliases,
  layout,
  zIndex,
} from './spacing';
export type { Spacing, SpacingAlias, BorderRadius, ShadowSize } from './spacing';

// Import for unified theme object
import { colors } from './colors';
import { fontSizes, fontWeights, lineHeights, typography } from './typography';
import { spacing, spacingAliases, layout, zIndex } from './spacing';

/**
 * Unified theme object
 * Contains all design tokens in a single structure.
 * Useful for theme providers or when you need the full theme.
 */
export const theme = {
  colors,
  typography,
  fontSizes,
  fontWeights,
  lineHeights,
  spacing,
  spacingAliases,
  layout,
  zIndex,
} as const;

export type Theme = typeof theme;

/**
 * Common style presets that combine multiple tokens
 * These can be spread into StyleSheet definitions
 */
export const stylePresets = {
  // Card styles
  card: {
    backgroundColor: colors.ui.cardBackground,
    borderRadius: layout.borderRadius.lg,
    ...layout.shadow.default,
  },

  // Screen container
  screenContainer: {
    flex: 1,
    backgroundColor: colors.ui.screenBackground,
  },

  // Section container with standard margins
  section: {
    marginHorizontal: spacingAliases.screenHorizontal,
    marginBottom: spacingAliases.sectionGap,
  },

  // Primary button
  primaryButton: {
    backgroundColor: colors.primary.default,
    borderRadius: layout.borderRadius.lg,
    height: layout.heights.buttonDefault,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing[4],
  },

  // Secondary button
  secondaryButton: {
    backgroundColor: colors.neutral.disabled,
    borderRadius: layout.borderRadius.lg,
    height: layout.heights.buttonDefault,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing[4],
  },

  // Danger/destructive button
  dangerButton: {
    backgroundColor: colors.error.light,
    borderRadius: layout.borderRadius.lg,
    height: layout.heights.buttonDefault,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing[4],
  },

  // Divider/separator
  divider: {
    height: layout.borderWidth.thin,
    backgroundColor: colors.ui.divider,
  },

  // Input field
  inputField: {
    height: layout.heights.inputDefault,
    borderWidth: layout.borderWidth.thin,
    borderColor: colors.neutral.border,
    borderRadius: layout.borderRadius.default,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.neutral.surface,
  },

  // Badge/pill
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: layout.borderRadius.full,
  },

  // List item
  listItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.ui.cardBackground,
  },

  // Row with space between
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },

  // Centered container
  centered: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
} as const;

export type StylePresets = typeof stylePresets;

/**
 * Helper to get text color based on background
 * Returns white for dark backgrounds, dark for light backgrounds
 */
export const getContrastingTextColor = (backgroundColor: string): string => {
  // Simple check - if it's a known light color, use dark text
  const lightBackgrounds: string[] = [
    colors.neutral.surface,
    colors.neutral.background,
    colors.error.light,
    colors.success.light,
    colors.warning.light,
    colors.primary.lightest,
    colors.primary.lighter,
  ];

  if (lightBackgrounds.includes(backgroundColor)) {
    return colors.text.primary;
  }

  return colors.text.inverse;
};
