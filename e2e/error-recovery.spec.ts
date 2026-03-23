import { expect, test } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

async function dismissOnboardingIfPresent(page: import('@playwright/test').Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('Error recovery scenarios', () => {
  test.describe('Offline → Online transition', () => {
    test('app recovers gracefully after going offline and back online', async ({
      page,
      context,
    }) => {
      await page.goto('/');
      await dismissOnboardingIfPresent(page);

      // Confirm the app loaded successfully before going offline
      await expect(page.getByRole('heading', { level: 1, name: /spinescanner/i })).toBeVisible();

      // Simulate going offline
      await context.setOffline(true);

      // The app should still show its shell (it's a client-side SPA)
      await expect(page.getByRole('heading', { level: 1, name: /spinescanner/i })).toBeVisible();

      // Navigate between tabs while offline — the SPA should still respond
      await page.getByTestId(uiContracts.navTabTestId('library')).click();
      await expect(page.getByTestId(uiContracts.navTabTestId('library'))).toBeVisible();

      // Go back online
      await context.setOffline(false);

      // Verify the app is still functional after reconnecting
      await page.getByTestId(uiContracts.navTabTestId('scan')).click();
      await expect(
        page.getByRole('heading', { name: /three easy ways to capture a book/i }),
      ).toBeVisible();
    });
  });

  test.describe('Failed navigation recovery', () => {
    test('all primary views load without errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto('/');
      await dismissOnboardingIfPresent(page);

      // Scan view (default)
      await expect(
        page.getByRole('heading', { name: /three easy ways to capture a book/i }),
      ).toBeVisible();

      // Library view
      await page.getByTestId(uiContracts.navTabTestId('library')).click();
      await expect(page.getByRole('heading', { name: /0 books ready to browse/i })).toBeVisible();

      // Data view
      await page.getByTestId(uiContracts.navTabTestId('data')).click();
      await expect(page.getByRole('heading', { name: /import & export/i })).toBeVisible();

      // Profile view
      await page.getByTestId(uiContracts.navTabTestId('profile')).click();
      await expect(page.getByRole('heading', { name: /profile & settings/i })).toBeVisible();

      // Navigate back to scan to confirm round-trip works
      await page.getByTestId(uiContracts.navTabTestId('scan')).click();
      await expect(
        page.getByRole('heading', { name: /three easy ways to capture a book/i }),
      ).toBeVisible();

      // No console errors should have been emitted during navigation
      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe('Empty state handling', () => {
    test('library shows empty state with no console errors on a fresh session', async ({
      page,
      context,
    }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Clear all storage to simulate a brand-new user
      await context.clearCookies();
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        indexedDB.databases?.().then((dbs) =>
          dbs.forEach((db) => {
            if (db.name) indexedDB.deleteDatabase(db.name);
          }),
        );
      });

      // Reload after clearing storage so the app starts fresh
      await page.reload();
      await dismissOnboardingIfPresent(page);

      // Navigate to the library tab
      await page.getByTestId(uiContracts.navTabTestId('library')).click();

      // Verify the empty state is displayed
      await expect(page.getByRole('heading', { name: /0 books ready to browse/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /add your first book/i })).toBeVisible();

      // No console errors
      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe('Service Worker registration', () => {
    // Service workers are only available in Chromium-based browsers in Playwright;
    // skip this test for WebKit/Firefox projects where the API is not exposed.
    test('app registers a service worker', async ({ page, context, browserName }) => {
      test.skip(browserName === 'webkit', 'Service worker inspection not supported in WebKit');

      await page.goto('/');
      await dismissOnboardingIfPresent(page);

      // Wait for the service worker to register (the app registers it on load)
      // Use a polling assertion to avoid a fixed-time wait.
      await expect
        .poll(
          async () => {
            const swCount = await page.evaluate(
              () => navigator.serviceWorker?.controller !== null,
            );
            return swCount;
          },
          { timeout: 15_000, message: 'Expected a service worker to be registered' },
        )
        .toBeTruthy();
    });
  });
});
