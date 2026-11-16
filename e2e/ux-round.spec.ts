import { expect, test, type Page } from '@playwright/test';
import { uiContracts } from '../src/testing/uiContracts';

const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';
const BOOK_STORAGE_KEY = 'spine-scanner-storage';

const shelfSeed = [
  {
    id: 'spine-kindred',
    title: 'Kindred',
    author: 'Octavia Butler',
    isbn: '9780807083697',
    pageCount: 264,
    coverImg: '',
    previewUrl: '',
    confidence: 0.91,
    decision: 'accept',
    metadataSource: 'open_library',
    detectionMethod: 'ocr',
    needsReview: false,
    reviewReason: '',
    rawText: 'Kindred',
  },
  {
    id: 'spine-mystery',
    title: 'Mystery Spine',
    author: 'Unknown Author',
    isbn: '',
    pageCount: 0,
    coverImg: '',
    previewUrl: '',
    confidence: 0.4,
    decision: 'accept',
    metadataSource: 'manual',
    detectionMethod: 'ocr',
    needsReview: true,
    reviewReason: 'Low confidence. Confirm or skip.',
    rawText: '',
  },
];

const dune = {
  id: 'e2e-dune',
  isbn: '9780441172719',
  title: 'Dune',
  author: 'Frank Herbert',
  pageCount: 400,
  amazonLink: '',
  coverImg: '',
  status: 'read',
  notes: '',
  dateAdded: '2026-01-01T00:00:00.000Z',
  shelfIds: [],
};

async function seedReady(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { preferences: { onboardingCompleted: true } }, version: 0 }),
    );
  }, PROFILE_STORAGE_KEY);
}

async function seedBook(page: Page) {
  await page.addInitScript(({ key, book }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { books: [book], shelves: [] }, version: 0 }),
    );
  }, { key: BOOK_STORAGE_KEY, book: dune });
}

test.describe('UX round', () => {
  test.use({ serviceWorkers: 'block' });
  test('shelf review can keep, skip, and fix a match before adding', async ({ page }) => {
    await seedReady(page);
    await page.addInitScript((items) => {
      (window as unknown as { __SPINE_E2E_SHELF_REVIEW__: unknown }).__SPINE_E2E_SHELF_REVIEW__ = items;
    }, shelfSeed);
    await page.route(/googleapis\.com/, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          volumeInfo: {
            title: 'Parable of the Sower',
            authors: ['Octavia E. Butler'],
            pageCount: 345,
            industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780446675505' }],
          },
        }],
      }),
    }));
    await page.route(/openlibrary\.org/, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ docs: [] }),
    }));

    await page.goto('./scan');
    await expect(page.getByRole('heading', { name: 'Check these books' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep Kindred' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Looks right')).toBeVisible();

    await page.getByRole('button', { name: 'Skip Mystery Spine' }).click();
    await expect(page.getByRole('button', { name: 'Skip Mystery Spine' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Edit Kindred' }).click();
    await page.getByRole('button', { name: 'Find a different match' }).click();
    await page.getByRole('button', { name: 'Use Parable of the Sower by Octavia E. Butler' }).click();
    await expect(page.getByRole('heading', { name: 'Parable of the Sower' })).toBeVisible();

    await page.getByTestId('shelf-import-btn').click();
    await expect(page.getByText('Added Parable of the Sower').first()).toBeVisible();

    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    await expect(page.getByText('Parable of the Sower').first()).toBeVisible();
    await expect(page.getByText('Mystery Spine')).toHaveCount(0);
  });

  test('suggestions distinguish an empty shelf, offline, an error, and nothing new', async ({ page }) => {
    await seedReady(page);
    await page.goto('./recommendations');
    const state = page.getByTestId('recommendations-state');
    await expect(state).toHaveAttribute('data-state', 'empty');
    await expect(page.getByRole('heading', { name: 'Nothing to suggest yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Add books' }).click();
    await expect(page).toHaveURL(/\/scan/);

    await seedBook(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    });
    await page.goto('./recommendations');
    await expect(state).toHaveAttribute('data-state', 'offline');
    await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('suggestions show an error when lookups fail', async ({ page }) => {
    await seedReady(page);
    await seedBook(page);
    await page.route(/openlibrary\.org|googleapis\.com/, (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{}',
    }));
    await page.goto('./recommendations');
    await expect(page.getByTestId('recommendations-state')).toHaveAttribute('data-state', 'error');
    await expect(page.getByRole('heading', { name: "Couldn't load suggestions" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  test('suggestions show nothing new when the catalogs are empty', async ({ page }) => {
    await seedReady(page);
    await seedBook(page);
    await page.route(/openlibrary\.org|googleapis\.com/, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ docs: [], totalItems: 0 }),
    }));
    await page.goto('./recommendations');
    await expect(page.getByTestId('recommendations-state')).toHaveAttribute('data-state', 'nothing-new');
    await expect(page.getByRole('heading', { name: 'Nothing new yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Add a book' }).click();
    await expect(page).toHaveURL(/\/scan/);
  });

  test('recommends books for a named shelf and moves with the keyboard', async ({ page }) => {
    await seedReady(page);
    const herbert = ['Dune', 'Children of Dune', 'God Emperor of Dune', 'Heretics of Dune'].map((title, index) => ({
      ...dune,
      id: `e2e-herbert-${index}`,
      title,
      isbn: `978044117271${index}`,
      shelfIds: ['sf'],
      loanLedger: index === 0
        ? [{ lentTo: 'Alex', lentAt: '2026-03-01T00:00:00.000Z', dueAt: '', returnedAt: '2026-04-01T00:00:00.000Z' }]
        : [],
    }));
    await page.addInitScript(({ key, books }) => {
      window.localStorage.setItem(key, JSON.stringify({
        state: {
          books,
          shelves: [{ id: 'sf', name: 'Sci-Fi', color: '#6366f1' }],
        },
        version: 0,
      }));
    }, {
      key: BOOK_STORAGE_KEY,
      books: [
        ...herbert,
        { ...dune, id: 'e2e-hyperion', title: 'Hyperion', author: 'Dan Simmons', isbn: '9780553283686', shelfIds: ['sf'] },
      ],
    });
    await page.route(/openlibrary\.org|googleapis\.com/, (route) => {
      const url = route.request().url();
      const docs = url.includes('isbn=')
        ? [{ subject: ['Science fiction'], key: '/works/OL1W' }]
        : url.includes('author=Frank')
          ? [{ title: 'Dune Messiah', author_name: ['Frank Herbert'], isbn: ['9780441013593'], subject: ['Science fiction'], cover_i: 10, number_of_pages_median: 336 }]
          : url.includes('subject=science')
            ? [{ title: 'The Left Hand of Darkness', author_name: ['Ursula K. Le Guin'], isbn: ['9780441007462'], subject: ['Science fiction'], cover_i: 11, number_of_pages_median: 304 }]
            : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ docs, totalItems: docs.length }),
      });
    });

    await page.goto('./recommendations');
    await expect(page.getByRole('heading', { level: 1, name: 'Recommended for your shelves' })).toBeVisible();
    await expect(page.getByText('Because you have 4 books by Frank Herbert')).toBeVisible();
    await expect(page.getByText('More from your Sci-Fi shelf')).toBeVisible();

    const list = page.getByRole('list', { name: 'Recommended for your shelves' });
    const first = list.getByRole('button', { name: /Add to wishlist/ }).first();
    const second = list.getByRole('button', { name: /Add to wishlist/ }).nth(1);
    await first.focus();
    await page.keyboard.press('ArrowDown');
    await expect(second).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Added .+ to your wishlist/).first()).toBeVisible();
  });
});
