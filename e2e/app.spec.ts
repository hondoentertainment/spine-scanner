import { expect, test } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

async function dismissOnboardingIfPresent(page: import('@playwright/test').Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('SpineScanner release smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await dismissOnboardingIfPresent(page);
  });

  test('loads the app shell and primary navigation', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /spinescanner/i })).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('scan'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('library'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('data'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('profile'))).toBeVisible();
  });

  test('scanner view is visible by default and manual ISBN entry works', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /three easy ways to capture a book/i })).toBeVisible();
    await page.getByTestId(uiContracts.scannerTypeIsbnTestId).first().click();
    await expect(page.getByTestId(uiContracts.scannerManualInputTestId)).toBeVisible();
  });

  test('library view shows the new empty-state flow', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByRole('heading', { name: /0 books ready to browse/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add your first book/i })).toBeVisible();
  });

  test('data and profile views load', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('data')).click();
    await expect(page.getByRole('heading', { name: /import & export/i })).toBeVisible();

    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await expect(page.getByRole('heading', { name: /profile & settings/i })).toBeVisible();
  });

  test('public support page exposes diagnostics actions', async ({ page }) => {
    await page.getByRole('button', { name: /^Support$/ }).click();
    await expect(page.getByRole('heading', { name: /help for scanning, syncing, and exports/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /support diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download json/i })).toBeVisible();
  });
});
