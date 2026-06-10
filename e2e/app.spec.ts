import { expect, test } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';

async function dismissOnboardingIfPresent(page: import('@playwright/test').Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('SpineScanner release smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Seed onboardingCompleted so the tour never blocks assertions via aria-modal.
    // The useEffect that shows the modal fires after React mounts, which can race
    // with goto's load event; seeding localStorage avoids the timing issue.
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
        );
      },
      { key: PROFILE_STORAGE_KEY },
    );
    // baseURL includes /spine-scanner/ — avoid leading "/" on gotos or the path resets to origin (see Playwright baseURL rules).
    await page.goto('./');
  });

  test('loads the app shell and primary navigation', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /spinescanner/i })).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('home'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('scan'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('library'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('profile'))).toBeVisible();
  });

  test('home feed is the default route', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Home$/ })).toBeVisible();
  });

  test('scanner view and manual ISBN entry work from the nav', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('scan')).click();
    await expect(page.getByRole('heading', { name: /three easy ways to capture a book/i })).toBeVisible();
    await page.getByTestId(uiContracts.scannerTypeIsbnTestId).first().click();
    await expect(page.getByTestId(uiContracts.scannerManualInputTestId)).toBeVisible();
  });

  test('library view shows the empty-state flow', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByRole('heading', { name: /start your library/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add your first book/i })).toBeVisible();
  });

  test('data route and profile load', async ({ page }) => {
    await page.goto('./data');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /import & export/i })).toBeVisible();

    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await expect(page.locator('#profile-settings-title')).toBeVisible();
  });

  test('profile exposes export and local data controls', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await expect(page.locator('#profile-settings-title')).toBeVisible();
    await expect(page.getByRole('button', { name: /download my data \(json\)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /clear all local data/i })).toBeVisible();
  });

  test('library review query loads without error', async ({ page }) => {
    await page.goto('./library?review=1');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /your library, built for browsing/i })).toBeVisible();
  });

  test('privacy page mentions local clear control', async ({ page }) => {
    await page.goto('./privacy');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /clearing data on your device/i })).toBeVisible();
  });

  test('public support page exposes diagnostics actions', async ({ page }) => {
    await page.getByRole('button', { name: /^Support$/ }).click();
    await expect(page.getByRole('heading', { name: /help for scanning, syncing, and exports/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /support diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download json/i })).toBeVisible();
  });

  test('data management route shows import, export, or backup affordances', async ({ page }) => {
    await page.goto('./data');
    await dismissOnboardingIfPresent(page);
    const dataMarker = page
      .getByRole('heading', { level: 2, name: /import|export|backup/i })
      .or(page.getByRole('button', { name: /import|export|backup/i }));
    await expect(dataMarker.first()).toBeVisible();
  });
});
