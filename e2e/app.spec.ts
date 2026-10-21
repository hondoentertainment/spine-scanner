import { expect, test } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';

async function dismissOnboardingIfPresent(page: import('@playwright/test').Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('SpineScanner release smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Seed onboardingCompleted so the tour never blocks assertions via aria-modal.
    // The useEffect that shows the modal fires after React mounts, which can race
    // with goto's load event; seeding localStorage avoids the timing issue.
    await page.addInitScript(
      ({ key }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
        );
      },
      { key: PROFILE_STORAGE_KEY },
    );
    // baseURL includes /spine-scanner/ — avoid leading "/" on gotos or the path resets to origin (see Playwright baseURL rules).
    await page.goto('./');
  });

  test('loads the app shell and primary navigation', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /spinescanner/i })).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('home'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('scan'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('library'))).toBeVisible();
    await expect(page.getByTestId(uiContracts.navTabTestId('profile'))).toBeVisible();
  });

  test('home feed is the default route', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Home$/ })).toBeVisible();
  });

  test('scan tab stays inside the bar on phone widths', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Phone tab-bar geometry is checked in Chromium with Safari and Chrome iOS user agents.');
    const agents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
    ];
    for (const width of [375, 390, 430]) {
      for (const userAgent of agents) {
        await page.setViewportSize({ width, height: 844 });
        const client = await page.context().newCDPSession(page);
        await client.send('Emulation.setUserAgentOverride', { userAgent });
        await page.goto('./scan');
        await dismissOnboardingIfPresent(page);
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        const scan = page.getByTestId(uiContracts.navTabTestId('scan'));
        const home = page.getByTestId(uiContracts.navTabTestId('home'));
        await expect(scan).toBeVisible();
        await expect(scan).toContainText('Scan');
        const navBox = await nav.boundingBox();
        const scanBox = await scan.boundingBox();
        const homeBox = await home.boundingBox();
        expect(navBox).not.toBeNull();
        expect(scanBox).not.toBeNull();
        expect(homeBox).not.toBeNull();
        expect(scanBox!.y).toBeGreaterThanOrEqual(navBox!.y - 1);
        expect(scanBox!.y + scanBox!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);
        expect(Math.abs(scanBox!.width - homeBox!.width)).toBeLessThan(12);
        expect(Math.abs(scanBox!.y - homeBox!.y)).toBeLessThan(4);
        const camera = page.getByTestId('scanner-camera');
        await expect(camera).toBeVisible();
        const cameraBox = await camera.boundingBox();
        expect(cameraBox).not.toBeNull();
        expect(cameraBox!.y + cameraBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
        const pad = await page.locator('#main-content').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
        expect(pad).toBeGreaterThanOrEqual((navBox!.height) - 1);
        await client.detach();
      }
    }

    // Chromium's automated window stays in display-mode: browser (CDP cannot override it).
    // The installed PWA uses the same bar height and safe-area padding under display-mode: standalone.
    const safeAreaRule = await page.evaluate(() => {
      const hits: string[] = [];
      for (const sheet of document.styleSheets) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          const text = rule.cssText;
          if (
            text.includes('safe-area-inset-bottom')
            && text.includes('--bottom-nav-bar-height')
            && text.includes('padding-bottom')
          ) {
            hits.push(text);
          }
        }
      }
      return hits.join('\n');
    });
    expect(safeAreaRule).toContain('env(safe-area-inset-bottom');
    expect(safeAreaRule).toContain('display-mode: standalone');
  });

  test('scanner view and manual ISBN entry work from the nav', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('scan')).click();
    await expect(page.getByTestId(uiContracts.scannerManualInputTestId)).toBeVisible();
    await expect(page.getByRole('heading', { name: /three easy ways to capture a book/i })).toBeVisible();
  });

  test('library view shows the empty-state flow', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByRole('heading', { name: /start your library/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add your first book/i })).toBeVisible();
  });

  test('data route and profile load', async ({ page }) => {
    await page.goto('./data');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /import & export/i })).toBeVisible();

    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await expect(page.locator('#profile-settings-title')).toBeVisible();
  });

  test('profile exposes export and local data controls', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await expect(page.locator('#profile-settings-title')).toBeVisible();
    await expect(page.getByRole('button', { name: /download my data \(json\)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /clear all local data/i })).toBeVisible();
  });

  test('library review query loads without error', async ({ page }) => {
    await page.goto('./library?review=1');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /^Library$/ })).toBeVisible();
  });

  test('privacy page mentions local clear control', async ({ page }) => {
    await page.goto('./privacy');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /clearing data on your device/i })).toBeVisible();
  });

  test('public support page exposes diagnostics actions', async ({ page }) => {
    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await page.getByRole('button', { name: /^Support$/ }).click();
    await expect(page.getByRole('heading', { name: /help for scanning, syncing, and exports/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /support diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy diagnostics/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download json/i })).toBeVisible();
  });

  test('data management route shows import, export, or backup affordances', async ({ page }) => {
    await page.goto('./data');
    await dismissOnboardingIfPresent(page);
    const dataMarker = page
      .getByRole('heading', { level: 2, name: /import|export|backup/i })
      .or(page.getByRole('button', { name: /import|export|backup/i }));
    await expect(dataMarker.first()).toBeVisible();
  });
});
