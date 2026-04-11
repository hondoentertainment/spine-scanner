import { expect, test } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

async function dismissOnboardingIfPresent(page: import('@playwright/test').Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('MVP build shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await dismissOnboardingIfPresent(page);
  });

  test('root route shows scanner, not Home feed', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /three easy ways/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Home$/ })).toHaveCount(0);
  });

  test('bottom nav has no Home tab', async ({ page }) => {
    const homeTab = page.getByTestId(uiContracts.navTabTestId('home'));
    await expect(homeTab).toHaveCount(0);
  });

  test('profile is lean: theme present, reading goals hidden', async ({ page }) => {
    await page.goto('./profile');
    await dismissOnboardingIfPresent(page);
    await expect(page.locator('#profile-settings-title')).toBeVisible();
    await expect(page.getByRole('heading', { name: /theme/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /reading goals/i })).toHaveCount(0);
  });

  test('library still reachable — open library from bottom nav', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await page.goto('./scan');
    await page.goto('./library');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /your library, built for browsing/i })).toBeVisible();
  });
});
