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
      fontFamily: {
        display: ['Oswald', 'Impact', 'sans-serif'],
        sans: ['"Source Sans 3"', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
