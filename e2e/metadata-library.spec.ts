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
  test('opens a book whose providers disagree', async ({ page }) => {
    await seedE2eLocalState(page);
    await seedLibraryBook(page, conflictSeedBook);
    await page.goto('./library');
    await dismissOnboardingIfPresent(page);

    await page.getByRole('button', { name: /Conflict Title/ }).first().click();
    const dialog = page.getByRole('dialog', { name: /Details for Conflict Title/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/via Google Books/i)).toBeVisible();
  });

  test('refresh metadata from the open book updates the title', async ({ page }) => {
    await seedE2eLocalState(page);
    await installMetadataFetchMocks(page);
    await seedLibraryBook(page, refreshSeedBook);

    await page.goto('./library');
    await dismissOnboardingIfPresent(page);

    await page.getByRole('button', { name: /Refresh Me/ }).first().click();
    await page.getByRole('button', { name: /refresh metadata from provider/i }).click();
    await expect(page.getByText(/Metadata refreshed from Google Books/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: /Details for Refreshed Title/i })).toBeVisible();
  });
});
