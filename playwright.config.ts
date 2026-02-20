import { defineConfig, devices } from '@playwright/test';

/** Dedicated port to avoid conflicts with other apps (e.g. Vite dev on 5173, other previews) */
const E2E_PORT = 4174;
/** App uses base /spine-scanner/ when not on Vercel (see vite.config.ts) */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${E2E_PORT}/spine-scanner/`;
const useWebServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome-pixel-7',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari-iphone-14',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'mobile-chrome-galaxy-s9',
      use: { ...devices['Galaxy S9+'] },
    },
  ],
  webServer: useWebServer
    ? {
        command: `npx vite preview --port ${E2E_PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
