/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand colors - semantic aliases that map to our theme
        brand: {
          primary: '#2563eb',      // colors.primary.default (blue-600)
          'primary-light': '#dbeafe', // colors.primary.lighter (blue-100)
          secondary: '#16a34a',    // colors.success.default (green-600)
        },
        // Category-specific colors for consistency
        category: {
          duplicates: '#dc2626',   // red-600
          'duplicates-bg': '#fee2e2', // red-100
          'large-files': '#ea580c',   // orange-600
          'large-files-bg': '#ffedd5', // orange-100
          screenshots: '#9333ea',  // purple-600
          'screenshots-bg': '#f3e8ff', // purple-100
        },
        // Tier colors
        tier: {
          free: '#374151',         // gray-700
          'free-bg': '#d1d5db',    // gray-300
          pro: '#2563eb',          // blue-600
          'pro-bg': '#2563eb',     // blue-600
        },
      },
      borderRadius: {
        'card': '12px',           // layout.borderRadius.lg
        'button': '12px',         // layout.borderRadius.lg
      },
      spacing: {
        'screen': '16px',         // spacingAliases.screenHorizontal
      },
    },
  },
  plugins: [],
}

