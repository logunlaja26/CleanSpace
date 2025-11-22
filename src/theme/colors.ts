/**
 * CleanSpace Color Palette
 *
 * Centralized color definitions for consistent theming.
 * Colors are organized into semantic categories for easy maintenance.
 *
 * Usage:
 * - Import colors where needed: import { colors } from '@/theme'
 * - Use with StyleSheet: { backgroundColor: colors.primary.default }
 * - Use with NativeWind: extend tailwind.config.js with these values
 */

// Raw color values - these match Tailwind's default palette
// for consistency with existing NativeWind classes
const palette = {
  // Blue (Primary)
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue200: '#bfdbfe',
  blue300: '#93c5fd',
  blue400: '#60a5fa',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  blue800: '#1e40af',
  blue900: '#1e3a8a',

  // Green (Success)
  green50: '#f0fdf4',
  green100: '#dcfce7',
  green200: '#bbf7d0',
  green300: '#86efac',
  green400: '#4ade80',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',
  green800: '#166534',
  green900: '#14532d',

  // Emerald (Secondary success)
  emerald500: '#10b981',
  emerald600: '#059669',

  // Red (Error/Danger)
  red50: '#fef2f2',
  red100: '#fee2e2',
  red200: '#fecaca',
  red300: '#fca5a5',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',
  red800: '#991b1b',
  red900: '#7f1d1d',

  // Orange (Warning)
  orange50: '#fff7ed',
  orange100: '#ffedd5',
  orange200: '#fed7aa',
  orange300: '#fdba74',
  orange400: '#fb923c',
  orange500: '#f97316',
  orange600: '#ea580c',
  orange700: '#c2410c',
  orange800: '#9a3412',
  orange900: '#7c2d12',

  // Purple (Accent)
  purple50: '#faf5ff',
  purple100: '#f3e8ff',
  purple200: '#e9d5ff',
  purple300: '#d8b4fe',
  purple400: '#c084fc',
  purple500: '#a855f7',
  purple600: '#9333ea',
  purple700: '#7e22ce',
  purple800: '#6b21a8',
  purple900: '#581c87',

  // Gray (Neutral)
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Pure
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

/**
 * Semantic color tokens
 * These provide meaning-based access to colors,
 * making it easier to maintain consistency and add dark mode later.
 */
export const colors = {
  // Brand colors
  primary: {
    lightest: palette.blue50,
    lighter: palette.blue100,
    light: palette.blue400,
    default: palette.blue600,
    dark: palette.blue700,
    darker: palette.blue800,
  },

  // Secondary/accent colors
  accent: {
    purple: {
      light: palette.purple100,
      default: palette.purple600,
    },
    orange: {
      light: palette.orange100,
      default: palette.orange600,
    },
  },

  // Semantic status colors
  success: {
    light: palette.green100,
    default: palette.green600,
    dark: palette.green700,
    // For gradient backgrounds
    gradient: {
      from: palette.green500,
      to: palette.emerald600,
    },
  },

  error: {
    light: palette.red100,
    default: palette.red600,
    dark: palette.red700,
  },

  warning: {
    light: palette.orange100,
    default: palette.orange500,
    dark: palette.orange600,
  },

  // Neutral colors for UI elements
  neutral: {
    background: palette.gray50,
    surface: palette.white,
    border: palette.gray200,
    borderLight: palette.gray100,
    disabled: palette.gray300,
  },

  // Text colors
  text: {
    primary: palette.gray800,
    secondary: palette.gray600,
    tertiary: palette.gray500,
    muted: palette.gray400,
    inverse: palette.white,
    link: palette.blue600,
  },

  // Common UI element colors
  ui: {
    cardBackground: palette.white,
    screenBackground: palette.gray50,
    divider: palette.gray200,
    dividerLight: palette.gray100,
    shadow: palette.black, // Use with opacity
    overlay: palette.black, // Use with opacity for modals
  },

  // Feature-specific colors (for category badges, etc.)
  category: {
    duplicates: {
      background: palette.red100,
      text: palette.red600,
    },
    largeFiles: {
      background: palette.orange100,
      text: palette.orange600,
    },
    screenshots: {
      background: palette.purple100,
      text: palette.purple600,
    },
    photos: {
      background: palette.blue100,
      text: palette.blue600,
    },
  },

  // Pro tier badge colors
  tier: {
    free: {
      background: palette.gray300,
      text: palette.gray700,
    },
    pro: {
      background: palette.blue600,
      text: palette.white,
    },
  },

  // Raw palette access (for custom use cases)
  palette,
} as const;

// Type exports for TypeScript support
export type ColorPalette = typeof palette;
export type SemanticColors = typeof colors;
