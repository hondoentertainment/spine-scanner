import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';

const ROUTES: Array<{ name: string; path: string }> = [
  { name: 'home', path: './' },
  { name: 'library', path: './library' },
  { name: 'data', path: './data' },
  { name: 'profile', path: './profile' },
];

async function seedOnboarding(page: Page) {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
      );
    },
    { key: PROFILE_STORAGE_KEY },
  );
}

test.describe('Accessibility (axe-core)', () => {
  for (const route of ROUTES) {
    test(`${route.name} has no critical a11y violations`, async ({ page }) => {
      await seedOnboarding(page);
      await page.goto(route.path);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const critical = results.violations.filter((v) => v.impact === 'critical');
      const serious = results.violations.filter((v) => v.impact === 'serious');

      // Non-blocking signal so the gate can be tightened over time without breaking CI today.
      if (serious.length > 0) {
        console.warn(`[a11y] ${route.name}: ${serious.length} serious violation(s)`);
        for (const v of serious) {
          console.warn(`  - ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`);
        }
      }

      expect(
        critical,
        critical.length
          ? `Critical a11y violations on ${route.name}:\n${critical
              .map((v) => `  - ${v.id}: ${v.help}`)
              .join('\n')}`
          : undefined,
      ).toEqual([]);
    });
  }
});
