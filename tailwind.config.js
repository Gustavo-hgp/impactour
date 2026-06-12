/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0a3fa8',
          dark: '#072e7d',
          light: '#e8effb',
        },
        accent: {
          DEFAULT: '#e11d2a',
          dark: '#b3151f',
        },
        popover: {
          DEFAULT: 'var(--chart-tooltip-background)',
          foreground: 'var(--chart-tooltip-foreground)',
        },
        background: 'var(--chart-background)',
        foreground: 'var(--chart-foreground)',
        border: 'var(--chart-grid)',
        muted: {
          DEFAULT: 'var(--chart-muted)',
          foreground: 'var(--chart-foreground-muted)',
        },
        card: {
          DEFAULT: 'var(--chart-background)',
          foreground: 'var(--chart-foreground)',
        },
        chart: {
          label: 'var(--chart-label)',
          'tooltip-muted': 'var(--chart-tooltip-muted)',
        },
      },
    },
  },
  plugins: [],
}
