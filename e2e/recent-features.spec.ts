import { expect, test, type Page } from '@playwright/test';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { uiContracts } from '../src/testing/uiContracts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOODREADS_CSV = join(__dirname, 'fixtures', 'goodreads-sample.csv');

const BOOK_STORAGE_KEY = 'spine-scanner-storage';
const PROFILE_STORAGE_KEY = 'spine-scanner-preferences';

interface SeedBook {
  id: string;
  isbn: string;
  title: string;
  author: string;
  pageCount: number;
  amazonLink: string;
  coverImg: string;
  status: 'to-read' | 'reading' | 'read' | 'dnf';
  notes: string;
  dateAdded: string;
  shelfIds: string[];
  pagesFinished?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  lastProgressAt?: string | null;
}

interface SeedPreferencesOverrides {
  currentStreak?: number;
  longestStreak?: number;
  lastStreakDate?: string | null;
  readingGoalBooksPerYear?: number | null;
  readingGoalPagesPerYear?: number | null;
}

async function seedBooks(page: Page, books: SeedBook[]) {
  await page.addInitScript(
    ({ key, payload }) => {
      window.localStorage.setItem(key, JSON.stringify(payload));
    },
    {
      key: BOOK_STORAGE_KEY,
      payload: { state: { books, shelves: [] }, version: 0 },
    },
  );
}

async function seedPreferences(page: Page, overrides: SeedPreferencesOverrides = {}) {
  const prefs = {
    theme: 'dark',
    librarySortBy: 'dateAdded',
    librarySortAsc: false,
    libraryViewMode: 'grid',
    libraryStatusFilter: 'all',
    batchModeDefault: false,
    showStatsDefault: false,
    showShelvesDefault: false,
    onboardingCompleted: true,
    smartShelves: [],
    savedViews: [],
    readingGoalBooksPerYear: overrides.readingGoalBooksPerYear ?? null,
    readingGoalPagesPerYear: overrides.readingGoalPagesPerYear ?? null,
    warnOnDuplicateIsbn: true,
    currentStreak: overrides.currentStreak ?? 0,
    longestStreak: overrides.longestStreak ?? 0,
    lastStreakDate: overrides.lastStreakDate ?? null,
  };
  await page.addInitScript(
    ({ key, payload }) => {
      window.localStorage.setItem(key, JSON.stringify(payload));
    },
    {
      key: PROFILE_STORAGE_KEY,
      payload: { state: { preferences: prefs }, version: 0 },
    },
  );
}

async function dismissOnboardingIfPresent(page: Page) {
  const skipButton = page.getByRole('button', { name: /skip tour/i });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

test.describe('Recent feature waves', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * Issue #43: Pages-read input updates progress.
   * Edit a 'reading' book, fill the labelled "Pages read" input, save,
   * and verify the value persisted (re-opening the detail still shows it).
   */
  test('pages-read input updates progress (Issue #43)', async ({ page }) => {
    test.setTimeout(30_000);
    await seedPreferences(page);
    await seedBooks(page, [
      {
        id: 'seed-43',
        isbn: '9780141036144',
        title: '1984',
        author: 'George Orwell',
        pageCount: 300,
        pagesFinished: 100,
        amazonLink: 'https://amazon.com/s?k=9780141036144',
        coverImg: '',
        status: 'reading',
        notes: '',
        dateAdded: new Date().toISOString(),
        shelfIds: [],
      },
    ]);

    await page.goto('./library');
    await dismissOnboardingIfPresent(page);

    // Switch to "All books" segment so the grid starts at the top of the page,
    // with no hero section competing for viewport space or DOM position. The
    // 'foryou' hero could push the virtualizer below the fold, causing it to
    // defer rendering of book cards until after the test clicks.
    await page.getByRole('button', { name: 'All books' }).click();

    // Wait for and click the first book card.
    await expect(page.locator('.book-card').first()).toBeVisible();
    await page.locator('.book-card').first().click();
    await expect(page.getByRole('dialog', { name: /Details for 1984/i })).toBeVisible();

    // Enter edit mode.
    const dialog = page.getByRole('dialog', { name: /Details for 1984/i });
    await dialog.getByRole('button', { name: /edit details/i }).click();

    // Fill the labelled "Pages read" input. Scope to the dialog to avoid
    // matching the session-form's unlabelled "Pages read" input that also
    // appears when showSessionSection=true (status=reading).
    const pagesInput = dialog.getByLabel(/^pages read$/i);
    await expect(pagesInput).toBeVisible();
    await pagesInput.fill('150');
    await pagesInput.blur();

    // Save out of edit mode (scoped to dialog to avoid the session-form Save).
    await dialog.getByRole('button', { name: /^save$/i }).click();

    // Re-enter edit mode and verify persistence.
    await dialog.getByRole('button', { name: /edit details/i }).click();
    await expect(dialog.getByLabel(/^pages read$/i)).toHaveValue('150');
  });

  /**
   * Issue #45: Sync status panel is absent when not signed in.
   * Negative path — useAuthStore is not persisted, so no signed-in session
   * exists in E2E. The "Sync status" section should not render.
   */
  test('sync status panel is absent on profile when not signed in (Issue #45)', async ({ page }) => {
    await seedPreferences(page);
    await page.goto('./profile');
    await dismissOnboardingIfPresent(page);

    await expect(page.locator('#profile-settings-title')).toBeVisible();
    await expect(page.getByRole('heading', { name: /sync status/i })).toHaveCount(0);
    await expect(page.getByText(/last synced/i)).toHaveCount(0);
  });

  /**
   * Issue #44: Goodreads CSV import.
   * Uploads a real-format Goodreads export. The importer doesn't call any
   * lookup APIs (it builds entries directly from the CSV with metadataSource='manual'),
   * so no network mocking is needed.
   */
  test('Goodreads CSV import adds books (Issue #44)', async ({ page }) => {
    test.setTimeout(30_000);

    await seedPreferences(page);

    await page.goto('./data');
    await dismissOnboardingIfPresent(page);
    await expect(page.getByRole('heading', { name: /import & export/i })).toBeVisible();

    // The dedicated Goodreads CSV file input is hidden; setInputFiles works on hidden inputs.
    const fileInput = page.locator('input[type="file"][aria-label="Import Goodreads CSV export"]');
    await expect(fileInput).toHaveCount(1);
    await fileInput.setInputFiles(GOODREADS_CSV);

    // Inline result message: "Imported N books (M duplicates skipped)" or similar.
    await expect(page.getByText(/imported \d+ book/i)).toBeVisible({ timeout: 10_000 });

    // Books should appear in the library after import.
    await page.getByTestId(uiContracts.navTabTestId('library')).click();
    const anyTitle = page
      .getByText('1984', { exact: false })
      .or(page.getByText('Project Hail Mary', { exact: false }))
      .or(page.getByText('The Pragmatic Programmer', { exact: false }));
    await expect(anyTitle.first()).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Issue #42: Reading streak surface in HomeFeed.
   * Seeds preferences.currentStreak=3 directly (vs triggering via store action,
   * which depends on advanceStreak's date logic) and verifies the streak
   * section renders with "{N}-day streak" text.
   */
  test('reading streak appears in HomeFeed when streak is active (Issue #42)', async ({ page }) => {
    await seedPreferences(page, { currentStreak: 3, longestStreak: 5, lastStreakDate: '2026-05-03' });
    await page.goto('./home');
    await dismissOnboardingIfPresent(page);

    const streakSection = page.getByRole('region', { name: /reading streak/i });
    await expect(streakSection).toBeVisible();
    await expect(streakSection.getByText(/3-day streak/i)).toBeVisible();
    // Best is shown when longestStreak > currentStreak.
    await expect(streakSection.getByText(/best:\s*5 days/i)).toBeVisible();
  });

  /**
   * Issue #42 negative: streak section is absent when currentStreak=0.
   */
  test('reading streak is hidden when streak is zero (Issue #42 negative)', async ({ page }) => {
    await seedPreferences(page, { currentStreak: 0 });
    await page.goto('./home');
    await dismissOnboardingIfPresent(page);

    await expect(page.getByRole('region', { name: /reading streak/i })).toHaveCount(0);
  });

  /**
   * Issue #49: Year in Books card visibility.
   * Positive: when at least one book was finished this year, the card renders.
   * Negative: with no read-this-year books, the card is hidden.
   */
  test('Year in Books card renders when books were finished this year (Issue #49)', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    await seedPreferences(page);
    await seedBooks(page, [
      {
        id: 'seed-49a',
        isbn: '9780141036144',
        title: '1984',
        author: 'George Orwell',
        pageCount: 300,
        amazonLink: '',
        coverImg: '',
        status: 'read',
        notes: '',
        dateAdded: `${currentYear}-01-15T00:00:00.000Z`,
        finishedAt: `${currentYear}-02-20T00:00:00.000Z`,
        shelfIds: [],
      },
      {
        id: 'seed-49b',
        isbn: '9780593135204',
        title: 'Project Hail Mary',
        author: 'Andy Weir',
        pageCount: 476,
        amazonLink: '',
        coverImg: '',
        status: 'read',
        notes: '',
        dateAdded: `${currentYear}-03-01T00:00:00.000Z`,
        finishedAt: `${currentYear}-03-15T00:00:00.000Z`,
        shelfIds: [],
      },
    ]);

    await page.goto('./home');
    await dismissOnboardingIfPresent(page);

    const yearSection = page.getByRole('region', { name: /your reading year/i });
    await expect(yearSection).toBeVisible();
    await expect(yearSection.getByRole('heading', { name: new RegExp(`${currentYear} in books`, 'i') })).toBeVisible();
    await expect(yearSection.getByText(/books finished/i)).toBeVisible();
    await expect(yearSection.getByText(/pages read/i)).toBeVisible();
    // With 2 books finished, busiest-month tile should render.
    await expect(yearSection.getByText(/busiest month/i)).toBeVisible();
  });

  test('Year in Books card hides when no books read this year (Issue #49 negative)', async ({ page }) => {
    await seedPreferences(page);
    // Empty library = no books finished this year.
    await seedBooks(page, []);
    await page.goto('./home');
    await dismissOnboardingIfPresent(page);

    await expect(page.getByRole('region', { name: /your reading year/i })).toHaveCount(0);
  });
});
