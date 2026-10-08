import type { Config } from 'tailwindcss';

// Design tokens from the prototype (brief, section 8). Colours that change with the dark theme are CSS
// variables (index.css) so every component follows the theme; `chrome` (bars, strips) is always dark.
const themed = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: themed('paper'),
        ink: themed('ink'),
        soft: themed('soft'),
        line: themed('line'),
        surface: themed('surface'), // cards and inputs: white in the light theme
        lei: themed('lei'), // Julie
        io: themed('io'), // Kawe
        chord: themed('chord'),
        chrome: '#1B2038', // navigation bars and strips: dark in both themes
        'chrome-ink': '#F2F3EF',
        coro: '#6B4BB8',
        acc: '#D98B00', // alternate tuning
        'acc-ink': '#8A5A00',
        'acc-tint': '#FBEBC8',
      },
      // Motion is short and quiet; every use is behind `motion-safe:` and index.css also zeroes it for people who
      // asked their device for reduced motion.
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-down-in': { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'peek-in': { from: { opacity: '0', transform: 'scale(0.86) translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        pop: { '0%': { transform: 'scale(0.4)', opacity: '0' }, '70%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'sheet-in': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out both',
        'slide-down-in': 'slide-down-in 200ms ease-out both',
        'rise-in': 'rise-in 180ms ease-out both',
        'peek-in': 'peek-in 260ms cubic-bezier(0.2, 1.1, 0.3, 1) both',
        pop: 'pop 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'sheet-in': 'sheet-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
      fontFamily: {
        display: ['Oswald', 'Impact', 'sans-serif'],
        sans: ['"Source Sans 3"', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
