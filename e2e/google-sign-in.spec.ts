import { expect, test, type Page } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';

async function seedSignedOut(page: Page) {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
    );
  }, { key: PROFILE_STORAGE_KEY });
}

test.describe('Google sign-in', () => {
  test('signed-out profile stays on this device when cloud sign-in is not configured', async ({ page }) => {
    await seedSignedOut(page);
    await page.goto('./profile');
    await expect(page.locator('#profile-settings-title')).toBeVisible();
    await expect(page.getByText(/cloud sign-in isn't set up for this install/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await expect(page.getByText('Saved locally on this device')).toBeVisible();

    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByRole('heading', { name: /start your library/i })).toBeVisible();

    await page.getByTestId(uiContracts.navTabTestId('scan')).click();
    await expect(page.getByTestId(uiContracts.scannerManualInputTestId)).toBeVisible();
  });

  test('Continue with Google renders and the signed-out library still works', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SPINE_E2E_SUPABASE__ = {
        url: 'https://example.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.e2e',
      };
    });
    await seedSignedOut(page);
    await page.route('**/*example.supabase.co/**', (route) => route.abort());
    await page.goto('./profile');

    const hooks = await page.evaluate(() => document.documentElement.dataset.e2eHooks === 'true');
    if (!hooks) {
      if (process.env.CI) {
        throw new Error('The E2E build is missing VITE_E2E_HOOKS=true, so Continue with Google could not be checked.');
      }
      test.skip(true, 'Build was not compiled with VITE_E2E_HOOKS');
      return;
    }

    const button = page.getByRole('button', { name: 'Continue with Google' }).first();
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page.getByText('Saved locally on this device')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toHaveCount(0);

    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByRole('heading', { name: /start your library/i })).toBeVisible();
    await page.getByTestId(uiContracts.navTabTestId('profile')).click();
    await expect(page.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible();
  });

  test('a disabled Google provider shows a friendly message and leaves the page usable', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SPINE_E2E_SUPABASE__ = {
        url: 'https://example.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.e2e',
      };
    });
    await seedSignedOut(page);
    await page.route('**/*example.supabase.co/**', (route) => route.abort());
    const description = encodeURIComponent('Unsupported provider: provider is not enabled');
    await page.goto(`./profile?error=validation_failed&error_description=${description}`);

    const hooks = await page.evaluate(() => document.documentElement.dataset.e2eHooks === 'true');
    if (!hooks) {
      if (process.env.CI) {
        throw new Error('The E2E build is missing VITE_E2E_HOOKS=true, so the OAuth error return could not be checked.');
      }
      test.skip(true, 'Build was not compiled with VITE_E2E_HOOKS');
      return;
    }

    await expect(page.getByRole('alert').first()).toContainText(/isn't available/i);
    await expect(page.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profile & Settings' })).toBeVisible();
    expect(page.url()).not.toContain('error_description');
    expect(page.url()).not.toContain('validation_failed');
  });

  test('a provider error in the URL hash is shown and then removed', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SPINE_E2E_SUPABASE__ = {
        url: 'https://example.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.e2e',
      };
    });
    await seedSignedOut(page);
    await page.route('**/*example.supabase.co/**', (route) => route.abort());
    const description = encodeURIComponent('Unsupported provider: provider is not enabled');
    await page.goto(`./profile#error=server_error&error_description=${description}`);

    const hooks = await page.evaluate(() => document.documentElement.dataset.e2eHooks === 'true');
    if (!hooks) {
      if (process.env.CI) {
        throw new Error('The E2E build is missing VITE_E2E_HOOKS=true, so the OAuth hash error could not be checked.');
      }
      test.skip(true, 'Build was not compiled with VITE_E2E_HOOKS');
      return;
    }

    await expect(page.getByRole('alert').first()).toContainText(/isn't available/i);
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).not.toContain('error_description');
    expect(hash).not.toContain('access_token');
    await expect(page.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible();
  });

  test('an OAuth code in the callback URL is cleared and the library still renders', async ({ page }) => {
    await page.addInitScript(() => {
      window.__SPINE_E2E_SUPABASE__ = {
        url: 'https://example.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.e2e',
      };
    });
    await seedSignedOut(page);
    await page.route('**/*example.supabase.co/**', (route) => route.abort());
    await page.goto('./library?code=auth-code-example#access_token=should-not-stay');

    const hooks = await page.evaluate(() => document.documentElement.dataset.e2eHooks === 'true');
    if (!hooks) {
      if (process.env.CI) {
        throw new Error('The E2E build is missing VITE_E2E_HOOKS=true, so the OAuth code callback could not be checked.');
      }
      test.skip(true, 'Build was not compiled with VITE_E2E_HOOKS');
      return;
    }

    await expect(page.getByRole('heading', { name: /start your library/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible();
    expect(page.url()).not.toContain('code=');
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).not.toContain('access_token');
  });
});
