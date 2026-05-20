import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uiContracts } from '../src/testing/uiContracts';

async function dismissOnboardingIfPresent(page: import('@playwright/test').Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('Accessibility (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await dismissOnboardingIfPresent(page);
  });

  test('home has no serious or critical axe violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect.soft(bad).toEqual([]);
  });

  test('scanner view has no serious or critical axe violations', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('scan')).click();
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect.soft(bad).toEqual([]);
  });

  test('privacy page renders for keyboard and axe', async ({ page }) => {
    await page.goto('./privacy');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /your library stays yours/i })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect.soft(bad).toEqual([]);
  });

  test('library with a seeded book has no serious or critical axe violations', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'spine-scanner-storage',
        JSON.stringify({
          state: {
            books: [{
              id: 'axe-book',
              isbn: '9780306406157',
              title: 'Accessible Test Book',
              author: 'Test Author',
              pageCount: 100,
              amazonLink: 'https://www.amazon.com/s?k=9780306406157',
              coverImg: '',
              status: 'to-read',
              notes: '',
              dateAdded: new Date().toISOString(),
              shelfIds: [],
            }],
            shelves: [],
          },
          version: 0,
        }),
      );
    });
    await page.goto('./library');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('button', { name: /open accessible test book/i })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect.soft(bad).toEqual([]);
  });
});
