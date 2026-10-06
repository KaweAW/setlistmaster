import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const forbiddenInCore = ['react', 'react-dom', 'react-router-dom', 'zustand', 'dexie'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // core/ must stay free of React and browser dependencies (reusable in React Native/Capacitor).
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: forbiddenInCore, patterns: ['**/data/**', '**/components/**', '**/pages/**'] },
      ],
      'no-restricted-globals': [
        'error',
        'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'indexedDB',
      ],
    },
  },
  // UI code never touches Dexie directly: it goes through the repository interfaces.
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['dexie'], patterns: ['**/data/dexie/**'] }],
    },
  },
  // Tests may build a real (fake-indexeddb) store to exercise the UI end to end.
  { files: ['**/__tests__/**'], rules: { 'no-restricted-imports': 'off' } },
);
