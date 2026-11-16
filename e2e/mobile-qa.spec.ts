import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, 'expected a visible box').not.toBeNull();
  return box!;
}

async function expectMinTarget(locator: Locator, min = 44) {
  const box = await boxOf(locator);
  expect(box.width, 'target width').toBeGreaterThanOrEqual(min);
  expect(box.height, 'target height').toBeGreaterThanOrEqual(min);
}

function isOpaque(color: string): boolean {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return false;
  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 4) return true;
  return Number(parts[3]) >= 0.99;
}

async function seedCompleted(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
    );
  }, PROFILE_STORAGE_KEY);
}

async function seedCloudSignIn(page: Page) {
  await page.addInitScript((key) => {
    window.__SPINE_E2E_SUPABASE__ = {
      url: 'https://example.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.e2e',
    };
    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
    );
  }, PROFILE_STORAGE_KEY);
  await page.route('**/*example.supabase.co/**', (route) => route.abort());
}

async function hooksEnabled(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.dataset.e2eHooks === 'true');
}

async function assertTourClearsTabBar(page: Page) {
  const dialog = page.getByRole('dialog', { name: /welcome tour/i });
  const panel = dialog.locator(':scope > *').first();
  const step = page.getByText(/step \d+ of \d+/i);
  const skip = page.getByRole('button', { name: /^skip tour$/i }).first();
  const nextOrDone = page.getByRole('button', { name: /^(next|done)$/i });
  const back = page.getByRole('button', { name: /previous step/i });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  await expect(dialog).toBeVisible();
  const background = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(isOpaque(background), `tour panel background ${background}`).toBe(true);

  const stepBox = await boxOf(step);
  const skipBox = await boxOf(skip);
  expect(overlaps(stepBox, skipBox), 'step label overlaps Skip').toBe(false);

  const panelBox = await boxOf(panel);
  const navBox = await boxOf(nav);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(navBox.y - 8);
  const actionBox = await boxOf(nextOrDone);
  expect(overlaps(actionBox, navBox), 'primary tour action overlaps the tab bar').toBe(false);

  const padBottom = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(padBottom).toBeGreaterThanOrEqual(navBox.height - 1);

  await expectMinTarget(skip);
  await expectMinTarget(back);
  await expectMinTarget(nextOrDone);
  await expectMinTarget(page.getByRole('button', { name: /^skip tour$/i }).last());

  const dot = page.getByTestId('tour-progress-dot').first();
  const dotBox = await boxOf(dot);
  expect(dotBox.height).toBeLessThanOrEqual(16);
  expect(dotBox.width).toBeLessThanOrEqual(28);
  await expect(page.getByRole('tab')).toHaveCount(0);
}

test.describe('Mobile QA', () => {
  test('welcome tour is opaque, readable, and clear of the tab bar', async ({ page }) => {
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 393, height: 852 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('./');
      await assertTourClearsTabBar(page);

      await page.getByRole('button', { name: /^next$/i }).click();
      await expect(page.getByText(/step 2 of 4/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /open scanner/i })).toBeVisible();
      await assertTourClearsTabBar(page);
    }
  });

  test('welcome tour stays readable on a desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./');
    const dialog = page.getByRole('dialog', { name: /welcome tour/i });
    const panel = dialog.locator(':scope > *').first();
    await expect(dialog).toBeVisible();
    const background = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(isOpaque(background)).toBe(true);
    expect(overlaps(await boxOf(page.getByText(/step 1 of 4/i)), await boxOf(page.getByRole('button', { name: /^skip tour$/i }).first()))).toBe(false);
    await expectMinTarget(page.getByRole('button', { name: /^next$/i }));
  });

  test('signed-out controls meet the 44px target without stretching the desktop header', async ({ page }) => {
    await seedCloudSignIn(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./');
    if (!(await hooksEnabled(page))) {
      test.skip(true, 'Build was not compiled with VITE_E2E_HOOKS');
      return;
    }

    await expectMinTarget(page.getByRole('button', { name: 'Profile and settings' }));
    await expectMinTarget(page.getByRole('button', { name: 'Continue with Google' }).first());
    await expectMinTarget(page.getByRole('button', { name: 'Use email instead' }).first());

    await page.setViewportSize({ width: 1280, height: 800 });
    const google = page.getByRole('button', { name: 'Continue with Google' }).first();
    const gear = page.getByRole('button', { name: 'Profile and settings' });
    const title = page.getByRole('heading', { level: 1, name: /spinescanner/i });
    await expectMinTarget(google);
    await expectMinTarget(gear);
    await expectMinTarget(page.getByRole('button', { name: 'Use email instead' }).first());
    const googleBox = await boxOf(google);
    expect(googleBox.width).toBeLessThan(420);
    expect(overlaps(await boxOf(title), await boxOf(gear))).toBe(false);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('profile inputs and delete actions meet the 44px target', async ({ page }) => {
    await seedCompleted(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./profile');
    const books = page.getByLabel('Books finished (year)');
    const pages = page.getByLabel('Pages finished (year)');
    const clear = page.getByRole('button', { name: 'Clear all local data' });
    const remove = page.getByRole('button', { name: 'Delete all my data' });
    await books.scrollIntoViewIfNeeded();
    await expectMinTarget(books);
    await pages.scrollIntoViewIfNeeded();
    await expectMinTarget(pages);
    await clear.scrollIntoViewIfNeeded();
    await expectMinTarget(clear);
    await remove.scrollIntoViewIfNeeded();
    await expectMinTarget(remove);
  });

  test('ISBN submit name includes the visible Add label', async ({ page }) => {
    await seedCompleted(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./scan');
    const add = page.getByTestId(uiContracts.scannerManualSubmitTestId);
    await expect(add).toBeVisible();
    await expect(add).toContainText('Add');
    await expect(add).toHaveAccessibleName(/Add/);
    expect(await add.getAttribute('aria-label')).toBe('Add ISBN');

    const results = await new AxeBuilder({ page })
      .include(`[data-testid="${uiContracts.scannerManualSubmitTestId}"]`)
      .withRules(['label-content-name-mismatch'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
