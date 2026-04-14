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

  test('security page renders for keyboard and axe', async ({ page }) => {
    await page.goto('./security');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /protecting readers and their libraries/i })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect.soft(bad).toEqual([]);
  });
});
