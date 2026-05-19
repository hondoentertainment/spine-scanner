import { test, expect } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'book-spine-isbn.png');

test.describe('OCR photo upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Ensure SpineScanner app loaded (not another app on same port)
    await expect(page.getByText(/SpineScanner|Scan Book Spine/i).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('extracts ISBN from uploaded OCR fixture image', async ({ page, context }) => {
    test.skip(!!process.env.CI && !process.env.RUN_OCR_E2E, 'Tesseract.js OCR too slow on default CI runners; set RUN_OCR_E2E=1 to run.');
    test.setTimeout(60000);
    const mockTitle = 'Test Book via OCR';

    // Mock APIs at context level
    await context.route(/googleapis\.com\/books\/v1\/volumes/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalItems: 1,
          items: [
            {
              volumeInfo: {
                title: mockTitle,
                authors: ['Test Author'],
                pageCount: 100,
                imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
              },
            },
          ],
        }),
      });
    });
    await context.route(/openlibrary\.org\/api\/books/, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));

    // Use the file input directly (hidden; setInputFiles works). First input is for ISBN scan.
    const fileInput = page.getByTestId(uiContracts.scannerFileInputTestId).first();
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles(FIXTURE_PATH);

    // OCR runs (15–45s first load, up to 2 min in CI); when ISBN found, onScan fires -> Google Books lookup -> "Added X to library"
    await expect(page.getByText(new RegExp(`Added.*${mockTitle}.*library`, 'i'))).toBeVisible({
      timeout: process.env.CI ? 120000 : 60000,
    });

    // Verify book appears in library
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByRole('heading', { name: /Your Library/ })).toBeVisible();
    await expect(page.getByText(mockTitle)).toBeVisible({ timeout: 5000 });
  });
});
