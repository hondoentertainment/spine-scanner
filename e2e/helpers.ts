import { expect, type Page } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

export async function seedE2eLocalState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'spine-scanner-preferences',
      JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
    );
    localStorage.setItem(
      'spine-scanner-consent-v1',
      JSON.stringify({ state: { analyticsConsent: 'denied' }, version: 0 }),
    );
  });
}

export async function seedLibraryBook(page: Page, book: Record<string, unknown>) {
  await page.addInitScript((entry) => {
    localStorage.setItem(
      'spine-scanner-storage',
      JSON.stringify({ state: { books: [entry], shelves: [] }, version: 0 }),
    );
  }, book);
}

export async function dismissOnboardingIfPresent(page: Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

export async function waitForAppShell(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: /spinescanner/i })).toBeVisible();
  await expect(page.locator('[class*="skeletonGrid"]')).toHaveCount(0, { timeout: 15_000 });
}

export async function clickNavTab(page: Page, tab: 'home' | 'scan' | 'library' | 'profile') {
  await waitForAppShell(page);
  await page.getByTestId(uiContracts.navTabTestId(tab)).click();
}

export const conflictSeedBook = {
  id: 'e2e-conflict-book',
  isbn: '9780141036144',
  title: 'Conflict Title',
  author: 'Author A',
  pageCount: 300,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
  needsReview: true,
  reviewReason: 'Metadata providers disagree — pick a source below.',
  metadataSource: 'google_books',
  metadataPeers: {
    google: { title: 'Google Title', author: 'Author A', pageCount: 300, thumbnail: '' },
    openLibrary: { title: 'Open Library Title', author: 'Author B', pageCount: 320, thumbnail: '' },
  },
};

export const refreshSeedBook = {
  id: 'e2e-refresh-book',
  isbn: '9780141036144',
  title: 'Refresh Me',
  author: 'Needs Metadata',
  pageCount: 0,
  amazonLink: '',
  coverImg: '',
  status: 'to-read',
  notes: '',
  dateAdded: new Date().toISOString(),
  shelfIds: [],
};

export function installMetadataFetchMocks(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('googleapis.com/books')) {
        return new Response(JSON.stringify({
          totalItems: 1,
          items: [{
            volumeInfo: {
              title: 'Refreshed Title',
              authors: ['Fresh Author'],
              pageCount: 240,
              imageLinks: { thumbnail: 'https://example.com/cover.jpg' },
            },
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('openlibrary.org/api/books')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
  });
}
