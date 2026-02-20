import { test, expect } from '@playwright/test';

test.describe('SpineScanner App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the app title and navigation', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('SpineScanner');
    // Navigation buttons should be present
    await expect(page.getByRole('button', { name: /scanner/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /library/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /data/i })).toBeVisible();
  });

  test('scanner view is shown by default', async ({ page }) => {
    await expect(page.getByText('Scan Book Spine')).toBeVisible();
  });

  test('can navigate to Library view', async ({ page }) => {
    await page.getByRole('button', { name: /library/i }).click();
    await expect(page.getByRole('heading', { name: /Your Library/ })).toBeVisible();
  });

  test('can navigate to Data view', async ({ page }) => {
    await page.getByRole('button', { name: /data/i }).click();
    await expect(page.getByText('Manage Library Data')).toBeVisible();
  });

  test('library shows empty state when no books', async ({ page }) => {
    await page.getByRole('button', { name: /library/i }).click();
    await expect(page.getByText(/your library is empty/i)).toBeVisible();
  });

  test('can toggle theme', async ({ page }) => {
    // Find the theme toggle button
    const toggle = page.getByRole('button', { name: /switch to light mode/i });
    await expect(toggle).toBeVisible();

    // Click to switch to light theme
    await toggle.click();

    // Verify the data-theme attribute changed
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('light');

    // Click again to go back to dark
    await page.getByRole('button', { name: /switch to dark mode/i }).click();
    const darkTheme = await page.locator('html').getAttribute('data-theme');
    expect(darkTheme).toBe('dark');
  });

  test('manual ISBN input is accessible', async ({ page }) => {
    // Click the manual entry button (icon button with aria-label, or fallback "Enter ISBN manually" text)
    const manualBtn = page.getByRole('button', { name: /manual isbn entry|enter isbn manually/i }).first();
    await expect(manualBtn).toBeVisible();
    await manualBtn.click();

    // Manual input should appear
    await expect(page.getByRole('textbox', { name: /enter isbn manually/i })).toBeVisible();
  });

  test('search input in library works', async ({ page }) => {
    await page.getByRole('button', { name: /library/i }).click();
    const search = page.getByRole('textbox', { name: /search library/i });
    await expect(search).toBeVisible();
    await search.fill('Test');
    await expect(search).toHaveValue('Test');
  });

  test('data export section is visible', async ({ page }) => {
    await page.getByRole('button', { name: /data/i }).click();
    await expect(page.getByText('Export Library')).toBeVisible();
    await expect(page.getByText('Import from File')).toBeVisible();
    await expect(page.getByText('Import from Web')).toBeVisible();
  });

  test('library status filters are visible', async ({ page }) => {
    await page.getByRole('button', { name: /library/i }).click();
    await expect(page.getByRole('button', { name: /all/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /to read/i })).toBeVisible();
    // Filter button shows "Reading (0)" — avoid matching "Toggle reading statistics"
    await expect(page.getByRole('button', { name: /^Reading \(\d+\)$/ })).toBeVisible();
  });

  test('can switch between grid and list view', async ({ page }) => {
    await page.getByRole('button', { name: /library/i }).click();
    const listBtn = page.getByRole('button', { name: /list view/i });
    const gridBtn = page.getByRole('button', { name: /grid view/i });
    await expect(gridBtn).toBeVisible();
    await expect(listBtn).toBeVisible();
    // Clicking list view should switch view mode
    await listBtn.click();
    // Grid button should still be visible for switching back
    await expect(gridBtn).toBeVisible();
  });

  test('shelf manager toggles', async ({ page }) => {
    await page.getByRole('button', { name: /library/i }).click();
    const shelfToggle = page.getByRole('button', { name: /toggle shelf manager/i });
    await shelfToggle.click();
    await expect(page.getByText('Shelves', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /create new shelf/i })).toBeVisible();
  });

  test('data management can be closed', async ({ page }) => {
    await page.getByRole('button', { name: /data/i }).click();
    await expect(page.getByText('Manage Library Data')).toBeVisible();
    await page.getByRole('button', { name: /close data management/i }).click();
    // Should navigate back to library
    await expect(page.getByRole('heading', { name: /Your Library/ })).toBeVisible();
  });

  test('full ISBN scan flow: manual entry → add book to library', async ({ page, context }) => {
    const testIsbn = '9780141036144';
    const mockTitle = 'The Great Gatsby';

    // Mock APIs at context level so they're in place before any request
    const mockPayload = {
      totalItems: 1,
      items: [{ volumeInfo: { title: mockTitle, authors: ['F. Scott Fitzgerald'], pageCount: 180, imageLinks: { thumbnail: 'https://example.com/cover.jpg' } } }],
    };
    await context.route(/googleapis\.com\/books\/v1\/volumes/, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPayload) }));
    await context.route(/openlibrary\.org\/api\/books/, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));

    // Open manual ISBN entry
    const manualBtn = page.getByRole('button', { name: /manual isbn entry|enter isbn manually/i }).first();
    await manualBtn.click();
    await expect(page.getByRole('textbox', { name: /enter isbn/i })).toBeVisible();

    // Enter ISBN and submit; wait for API request before asserting toast
    const input = page.getByRole('textbox', { name: /enter isbn/i });
    await input.fill(testIsbn);
    const responsePromise = page.waitForResponse(/googleapis\.com\/books\/v1\/volumes/, { timeout: 5000 });
    await page.getByRole('button', { name: /submit isbn/i }).click();
    await responsePromise;

    // Toast shows "Added "Title" to library!"
    await expect(page.getByText(new RegExp(`Added.*${mockTitle}.*library`, 'i'))).toBeVisible({ timeout: 10000 });

    // Navigate to library and verify book is there
    await page.getByRole('button', { name: /library/i }).click();
    await expect(page.getByRole('heading', { name: /Your Library/ })).toBeVisible();
    await expect(page.locator(`h2, h3`).filter({ hasText: mockTitle }).first()).toBeVisible({ timeout: 5000 });
  });
});
