import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new version waits until the user chooses to reload. Never swap the app under a live gig.
      registerType: 'prompt',
      injectRegister: false, // registered by hand in main.tsx (virtual:pwa-register)
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Scaletta',
        short_name: 'Scaletta',
        description: 'Setlists, chords and charts for the stage',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1B2038',
        theme_color: '#1B2038',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs, including the lazy chunks (song page, PDF viewer) and the pdf.js worker (.mjs),
        // is cached on first load: after that the whole app works without a network.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html', // any app route opened offline gets the app shell
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
