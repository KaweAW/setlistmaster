import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: a real browser against the production build (`pnpm build`, served by `vite preview`).
 * Run them with `pnpm test:e2e`. They live apart from the Vitest suite, which covers the logic and the screens in jsdom.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'en-US',
    // The app registers a service worker in production; blocked here so every test starts from the network, not from a cache.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    // Set PW_CHROMIUM to use an already installed Chromium instead of the one `playwright install` downloads.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
