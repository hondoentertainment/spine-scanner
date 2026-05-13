# Changelog

## Unreleased

### This wave (Phase 27 completion / Phase 30 resilience / Phase 33–34 polish)

- **Reading session log (Phase 27):** `useReadingSessionStore` — persisted Zustand store with `startSession`, `stopSession`, `cancelSession`, per-book `sessionsForBook()`, and aggregate `stats()` (avg pages/hr, longest session, sessions this week). Start/Stop timer button on `BookCard` for `status='reading'` books (shows elapsed time, inline pages-read form on stop). Session history + stats section in `BookDetail`. `ReadingSession` type added to `src/types.ts`. 16 unit tests.
- **Sync resilience (Phase 30):** `src/lib/syncRetry.ts` — `withRetry<T>(fn, opts)` with exponential backoff (4 attempts, 2 s base, 30 s cap). All Supabase upsert/delete calls in `pushBooks`/`pushShelves` now wrapped with `withRetry`. Pre-push snapshot saved to `useSyncQueue` (`lastGoodSnapshot` / `lastGoodSnapshotAt`) so users can roll back. Conflict detection in `mergeSync` (title/author/notes differ between local and remote for same `id`). Snapshot restore + conflict warning UI in `ProfileSettings`. 7 unit tests.
- **StoryGraph CSV import (Phase 33):** `importFromStoryGraphCSV` in `importLogic.ts` — maps all four StoryGraph read statuses, parses `Dates Read` pipe pairs into `startedAt`/`finishedAt`, extracts `Series` into `seriesName`, deduplicates by ISBN and normalized title+author. Import button in `DataManagement`. 14 unit tests.
- **ICS calendar export (Phase 33):** `exportToICS` in `exportFormats.ts` — RFC 5545 VCALENDAR with one `VEVENT` per finished book (DATE-only, UID, SUMMARY, DESCRIPTION). Line folding at 75 octets, text escaping, CRLF line endings. "Export reading calendar (.ics)" button in `DataManagement`. 15 unit tests.
- **Feature flag scaffolding (Phase 34):** `src/utils/featureFlags.ts` — `FEATURE_FLAGS` constant listing all in-progress phases; `src/hooks/useFeatureFlag.ts` — `useFeatureFlag(name)` with `localStorage` override support (`ff_<name>=true/false`). 4 unit tests.
- **In-app changelog (Phase 34):** `src/changelog.json` — version-tagged entry list; `ChangelogModal` component (accessible dialog, focus trap, scrollable version list); "What's new" button in `ProfileSettings`.
- **Diagnostics download (Phase 34):** `downloadDiagnosticsBundle` in `supportDiagnostics.ts` — one-click download of `spinescanner-diagnostics-YYYYMMDD.json` containing book count, preferences, last 100 analytics events, and filtered `localStorage` (keys with password/token/key excluded). "Download diagnostics" button in `ProfileSettings`. 6 unit tests.

### Previous wave

- **Phase 25 (Scan Accuracy Hardening) closed:** `scripts/benchmark-scan.ts` runs the pipeline against the regression fixture set and outputs CSV (`npm run benchmark:scan`); closes Issue #36.
- **Phase 26 (Metadata Quality Layer):** `MetadataSource` and `MetadataConflict` types on `BookEntry`; parallel Google Books + Open Library queries with field-level conflict detection (author / pageCount / title); source badge and conflict warning in `BookDetail`; safe **Refresh metadata** action that preserves `userEditedFields`; `metadata_conflict` analytics event. Closes Issues #37, #38, #39.
- **Bulk metadata refresh:** `DataManagement` "Refresh all books without metadata source" — throttled (500 ms/book), cancellable, live progress (Issue #47).
- **Edition-level duplicate detection:** `findEditionDuplicateGroups` finds books with matching normalized title+author but different ISBNs (handles diacritics, edition suffixes, hardcover/paperback). Amber **Possible duplicate editions** panel in `DataManagement` with merge actions (Issue #53).
- **Goodreads CSV import:** `importFromGoodreadsCSV` parses the official Goodreads export (handles `="..."` ISBN wrappers, Exclusive Shelf → status, Date Read → `finishedAt`); import button in `DataManagement` (Issue #44).
- **Reading workflow (Phase 27):**
  - Pages-read input in `BookDetail` edit mode for `status='reading'` books; prominent `N of M pages (X%)` line in view mode (Issue #43).
  - Reading streak tracking: `currentStreak` / `longestStreak` / `lastStreakDate` in `ProfilePreferences`; advances on `updateBookStatus` (read/reading) or `updateReadingProgress`; flame card in `HomeFeed` when active (Issue #42).
  - **Streak timezone fix:** `new Date("YYYY-MM-DD")` parsed as UTC midnight, so users west of UTC computed "yesterday" as 2 days ago and lost their streak. Centralised in `toLocalDateKey()` and yesterday is now derived by subtracting from a local Date. 7 unit tests with `vi.setSystemTime` (Issue #51).
  - Year in Books stats card: books finished, pages read, avg pages/book, busiest month — derived from `finishedAt` (Issue #49).
  - Series completion hints: top incomplete series surfaced in `HomeFeed` with progress bar and "View series" link (Issue #46).
- **Sync visibility (Phase 30 start):** Sync status section in `ProfileSettings` showing last sync time, pending count, and failure warning with reload-to-retry; only renders when signed in (Issue #45).
- **Test coverage (Issue #41):** Branch-coverage additions across `useBookLookup`, `useScanPipeline`, `useAuthStore`, `importLogic`; thresholds raised to stmts 65 / branches 55 / funcs 62 / lines 67.
- **E2E coverage:** `e2e/recent-features.spec.ts` covering Issues #42, #43, #44, #45, #49 with `e2e/fixtures/goodreads-sample.csv`; added to `test:e2e:release` so CI runs it (Issue #52).
- **Tooling:** ESLint and Vitest now ignore `.claude/**` to prevent agent-worktree contamination during local dev runs.

## [1.2.2] - 2026-04-10

- **Docs:** `.env.example` for all `VITE_*` variables; `docs/RELEASING.md` (tags, GitHub Release, Vercel, MVP project note).
- **DX:** `appModeMatrix` in `appMode.ts` documents MVP vs full UI; PR template checklist; OCR integration workflow timeout 45m + retry note.
- **MVP library:** Hero highlight cards (review / reading / completion / finished this year) hidden in MVP builds.
- **E2E:** Data route smoke test on full and MVP builds.

## [1.2.1] - 2026-04-10

- **MVP build:** `VITE_APP_MODE=mvp` / `npm run build:mvp` — scan-first shell (see prior release notes for App/Profile behavior).
- **MVP library:** All-books default; segment bar and saved views / smart shelves UI hidden in MVP.
- **E2E:** `e2e/mvp.spec.ts`, project `chromium-mvp`, `npm run test:e2e:mvp`; `test:e2e` lists desktop+mobile projects explicitly so MVP specs do not run on a full build.
- **CI:** Manual `e2e-mvp` workflow: `check:production` + `test:e2e:mvp`.

## [1.2.0] - 2026-04-10

- **Fix:** ESLint passes under `react-hooks` rules (BookDetail resets via `key` on open; shared `summarizeAnalyticsEvents`; library filter-chip `useMemo` deps).

- **CI:** "Lint, Test & Build" on push and pull request to `main`: ESLint, `check:production`, unit tests, production build, and Playwright release E2E (`test:e2e:release`).
- **CI:** GitHub Pages deploy workflow runs on `workflow_dispatch` only (production is Vercel); avoids failing automatic Pages runs on every push.
- **CI:** Weekly OCR integration job (`npm run test:integration`) via schedule and manual dispatch.
- **CI:** Manual Pages build uses repository variable `VITE_SUPPORT_EMAIL` when set, otherwise `noreply@example.com`.
- **Tooling:** Vitest `testTimeout` 180s when `CI=true`; ignore scratch base64 temp files (`tmp_b64.txt`, `*.tmp.b64.txt`).
- **OCR:** Broader ISBN checksum repair for 4↔5 misreads so invalid candidates like `9780141036145` can suggest `9780141036144`.
- **Library:** “All series” filter (from `seriesName` on books) plus active filter chip.
- **Header:** When signed in and cloud sync is configured, a compact “N to sync” control mirrors the Home sync message.
- **Profile:** “Clear all local data” (with confirm) and “Cloud account & deletion” guidance; public Privacy/Terms copy updated for local clear vs account removal.
- **E2E:** Profile data controls, library `?review=1` load, privacy heading smoke.
- **Fix:** Profile no longer hits React “maximum update depth” in production — analytics hook subscribed via `events` + `useMemo` instead of a selector that returned a new `getSummary()` object every snapshot.
- **Fix:** Book store persist `merge` only applies `books` / `shelves` from storage so rehydration cannot clobber in-memory actions.

- **Home:** Reading goal progress (when set in Profile), sync status for signed-in users, review-queue shortcut, and light “suggestions” from current and want-to-read titles.
- **Books:** Optional `seriesName` / `seriesIndex` and a “Highlights & quotes” field on book detail (stored as structured entries; included in JSON backup).
- **Profile:** Yearly book/page goals, “Download my data (JSON)” snapshot (library + preferences), and a toggle to allow duplicate ISBN adds without the warning flow.
- **Data:** HTML export for print-friendly lists; duplicate-ISBN groups with merge-into-one action.
- **Privacy copy:** Clarifies goals, highlights, duplicate merge, and data export behavior.
- **PWA:** In-browser install prompt when the browser supports `beforeinstallprompt`.
