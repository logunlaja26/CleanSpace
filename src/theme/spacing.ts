/**
 * CleanSpace Spacing System
 *
 * Defines consistent spacing values based on an 4-point grid system.
 * All spacing values are multiples of 4 for visual consistency.
 * Values align with Tailwind's spacing scale for NativeWind compatibility.
 *
 * Usage:
 * - Import: import { spacing, layout } from '@/theme'
 * - Use with StyleSheet: { padding: spacing.md, margin: spacing.lg }
 * - Use layout values: { borderRadius: layout.borderRadius.lg }
 */

/**
 * Base spacing scale (in pixels)
 * Based on 4-point grid system, matches Tailwind's spacing scale
 */
export const spacing = {
  // Micro spacing
  none: 0,       // p-0
  px: 1,         // p-px
  '0.5': 2,      // p-0.5
  1: 4,          // p-1

  // Small spacing
  1.5: 6,        // p-1.5
  2: 8,          // p-2
  2.5: 10,       // p-2.5
  3: 12,         // p-3

  // Medium spacing
  3.5: 14,       // p-3.5
  4: 16,         // p-4
  5: 20,         // p-5
  6: 24,         // p-6

  // Large spacing
  7: 28,         // p-7
  8: 32,         // p-8
  9: 36,         // p-9
  10: 40,        // p-10

  // Extra large spacing
  11: 44,        // p-11
  12: 48,        // p-12
  14: 56,        // p-14
  16: 64,        // p-16

  // Screen-level spacing
  20: 80,        // p-20
  24: 96,        // p-24
  28: 112,       // p-28
  32: 128,       // p-32
} as const;

/**
 * Semantic spacing aliases
 * Named values for common use cases
 */
export const spacingAliases = {
  // Component internal padding
  xxs: spacing['0.5'],  // 2px - very tight padding
  xs: spacing[1],       // 4px - tight padding
  sm: spacing[2],       // 8px - small padding
  md: spacing[4],       // 16px - default padding
  lg: spacing[6],       // 24px - comfortable padding
  xl: spacing[8],       // 32px - spacious padding
  '2xl': spacing[12],   // 48px - very spacious
  '3xl': spacing[16],   // 64px - section spacing

  // Screen margins
  screenHorizontal: spacing[4],  // 16px - standard screen padding
  screenVertical: spacing[4],    // 16px - standard screen padding

  // Component gaps
  listItemGap: spacing[3],       // 12px - between list items
  cardGap: spacing[4],           // 16px - between cards
  sectionGap: spacing[6],        // 24px - between sections
} as const;

/**
 * Layout-specific values
 * Border radius, shadows, and other dimensional values
 */
export const layout = {
  // Border radius values
  borderRadius: {
    none: 0,
    sm: 4,
    default: 8,      // rounded-lg equivalent
    md: 8,
    lg: 12,          // rounded-xl equivalent
    xl: 16,          // rounded-2xl equivalent
    '2xl': 24,
    full: 9999,      // rounded-full - for pills/circles
  },

  // Border widths
  borderWidth: {
    none: 0,
    hairline: 0.5,
    thin: 1,
    default: 1,
    medium: 2,
    thick: 4,
  },

  // Shadow configurations (for iOS)
  shadow: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
  },

  // Common component heights
  heights: {
    buttonSmall: 36,
    buttonDefault: 44,
    buttonLarge: 52,
    inputDefault: 44,
    inputLarge: 52,
    listItem: 56,
    navBar: 44,
    tabBar: 49,
    headerLarge: 96,
  },

  // Icon sizes
  iconSizes: {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
    '2xl': 40,
  },

  // Touch targets (minimum 44pt for accessibility)
  touchTarget: {
    minimum: 44,
    comfortable: 48,
    large: 56,
  },
} as const;

/**
 * Z-index scale for layering
 */
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
} as const;

// Type exports
export type Spacing = keyof typeof spacing;
export type SpacingAlias = keyof typeof spacingAliases;
export type BorderRadius = keyof typeof layout.borderRadius;
export type ShadowSize = keyof typeof layout.shadow;
