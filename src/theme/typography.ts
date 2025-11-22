/**
 * CleanSpace Typography System
 *
 * Defines consistent text styles for visual hierarchy and readability.
 * Values align with Tailwind's default scale for NativeWind compatibility.
 *
 * Usage:
 * - Import: import { typography, fontSizes, fontWeights } from '@/theme'
 * - Use with StyleSheet: { ...typography.heading.h1 }
 * - Use individual values: { fontSize: fontSizes.lg }
 */

/**
 * Font size scale (in pixels)
 * Matches Tailwind's text-* classes for consistency
 */
export const fontSizes = {
  xs: 12,    // text-xs
  sm: 14,    // text-sm
  base: 16,  // text-base
  lg: 18,    // text-lg
  xl: 20,    // text-xl
  '2xl': 24, // text-2xl
  '3xl': 30, // text-3xl
  '4xl': 36, // text-4xl
  '5xl': 48, // text-5xl
} as const;

/**
 * Font weight values
 * React Native uses numeric values for fontWeight
 */
export const fontWeights = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
} as const;

/**
 * Line height multipliers
 * Applied relative to font size for proper spacing
 */
export const lineHeights = {
  tight: 1.25,   // leading-tight - compact text
  snug: 1.375,   // leading-snug - slightly compact
  normal: 1.5,   // leading-normal - comfortable reading
  relaxed: 1.625, // leading-relaxed - spacious
  loose: 2,      // leading-loose - very spacious
} as const;

/**
 * Letter spacing values (in pixels)
 */
export const letterSpacing = {
  tighter: -0.8,
  tight: -0.4,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  widest: 1.6,
} as const;

/**
 * Pre-defined text style presets
 * Combines size, weight, and line height for common use cases
 */
export const typography = {
  // Headings
  heading: {
    h1: {
      fontSize: fontSizes['3xl'],
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes['3xl'] * lineHeights.tight,
    },
    h2: {
      fontSize: fontSizes['2xl'],
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes['2xl'] * lineHeights.tight,
    },
    h3: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes.xl * lineHeights.snug,
    },
    h4: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes.lg * lineHeights.snug,
    },
  },

  // Body text
  body: {
    large: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.normal,
      lineHeight: fontSizes.lg * lineHeights.normal,
    },
    default: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.normal,
      lineHeight: fontSizes.base * lineHeights.normal,
    },
    small: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.normal,
      lineHeight: fontSizes.sm * lineHeights.normal,
    },
    tiny: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.normal,
      lineHeight: fontSizes.xs * lineHeights.normal,
    },
  },

  // Labels and UI text
  label: {
    large: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.semibold,
      lineHeight: fontSizes.base * lineHeights.snug,
    },
    default: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      lineHeight: fontSizes.sm * lineHeights.snug,
    },
    small: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.semibold,
      lineHeight: fontSizes.xs * lineHeights.snug,
    },
  },

  // Button text
  button: {
    large: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes.lg * lineHeights.tight,
    },
    default: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.semibold,
      lineHeight: fontSizes.base * lineHeights.tight,
    },
    small: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      lineHeight: fontSizes.sm * lineHeights.tight,
    },
  },

  // Special text styles
  special: {
    // Large display numbers (e.g., storage size "2.1 GB")
    displayNumber: {
      fontSize: fontSizes['4xl'],
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes['4xl'] * lineHeights.tight,
    },
    // Card titles
    cardTitle: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes.lg * lineHeights.snug,
    },
    // Section headers
    sectionHeader: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes.lg * lineHeights.snug,
    },
    // Caption text
    caption: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.normal,
      lineHeight: fontSizes.xs * lineHeights.normal,
    },
    // Badge text
    badge: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.bold,
      lineHeight: fontSizes.xs * lineHeights.tight,
    },
  },
} as const;

// Type exports
export type FontSize = keyof typeof fontSizes;
export type FontWeight = keyof typeof fontWeights;
export type LineHeight = keyof typeof lineHeights;
export type Typography = typeof typography;
