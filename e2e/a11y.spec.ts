import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uiContracts } from '../src/testing/uiContracts';

const filterCriticalOrSerious = (violations: { impact?: string; id: string; description: string; nodes: { html: string }[] }[]) =>
  violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');

const formatViolations = (violations: { impact?: string; id: string; description: string; nodes: { html: string }[] }[]) =>
  violations
    .map((v) => `${v.id}: ${v.description}\n  - ${v.nodes.map((n) => n.html).join('\n  - ')}`)
    .join('\n');

test.describe('Accessibility audit', () => {
  test('scan view has no critical or serious a11y violations', async ({ page }) => {
    await page.goto('/');
    // Ensure the scan view is active (default)
    await page.waitForSelector('h1');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze();

    const critical = filterCriticalOrSerious(results.violations);
    expect(critical, formatViolations(critical)).toHaveLength(0);
  });

  test('library view has no critical or serious a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze();

    const critical = filterCriticalOrSerious(results.violations);
    expect(critical, formatViolations(critical)).toHaveLength(0);
  });

  test('data view has no critical or serious a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(uiContracts.navTabTestId('data')).click();
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze();

    const critical = filterCriticalOrSerious(results.violations);
    expect(critical, formatViolations(critical)).toHaveLength(0);
  });

  test('profile view has no critical or serious a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
      .analyze();

    const critical = filterCriticalOrSerious(results.violations);
    expect(critical, formatViolations(critical)).toHaveLength(0);
  });
});
