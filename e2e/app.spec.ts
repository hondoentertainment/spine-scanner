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
    await expect(page.getByText('Your Library')).toBeVisible();
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
    // Click the manual entry button in the scanner
    const manualBtn = page.getByRole('button', { name: /manual isbn entry/i });
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
    await expect(page.getByRole('button', { name: /reading/i })).toBeVisible();
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
    await expect(page.getByText('Shelves')).toBeVisible();
    await expect(page.getByRole('button', { name: /create new shelf/i })).toBeVisible();
  });

  test('data management can be closed', async ({ page }) => {
    await page.getByRole('button', { name: /data/i }).click();
    await expect(page.getByText('Manage Library Data')).toBeVisible();
    await page.getByRole('button', { name: /close data management/i }).click();
    // Should navigate back to library
    await expect(page.getByText('Your Library')).toBeVisible();
  });
});
