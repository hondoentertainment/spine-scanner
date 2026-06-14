import { expect, test } from '@playwright/test';
import {
  conflictSeedBook,
  dismissOnboardingIfPresent,
  installMetadataFetchMocks,
  refreshSeedBook,
  seedE2eLocalState,
  seedLibraryBook,
} from './helpers';

test.describe('Library metadata flows', () => {
  test('resolves provider conflicts from book detail', async ({ page }) => {
    await seedE2eLocalState(page);
    await seedLibraryBook(page, conflictSeedBook);
    await page.goto('./library');
    await dismissOnboardingIfPresent(page);

    await page.getByRole('button', { name: /open conflict title/i }).click();
    await expect(page.getByRole('heading', { name: /providers disagree/i })).toBeVisible();
    await page.getByRole('button', { name: /use open library metadata/i }).click();
    await expect(page.getByText(/metadata source applied/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /providers disagree/i })).toHaveCount(0);
  });

  test('bulk refresh metadata updates selected books', async ({ page }) => {
    await seedE2eLocalState(page);
    await installMetadataFetchMocks(page);
    await seedLibraryBook(page, refreshSeedBook);

    await page.goto('./library');
    await dismissOnboardingIfPresent(page);

    await page.getByRole('button', { name: /select books/i }).click();
    await page.getByRole('checkbox', { name: /select/i }).check();
    await page.getByRole('button', { name: /^refresh metadata$/i }).click();
    await expect(page.getByText(/refreshed 1 book/i)).toBeVisible({ timeout: 20_000 });
  });
});
