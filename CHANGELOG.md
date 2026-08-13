# Changelog

## Unreleased

### Deploy hardening + data polish (from #83)

- **Goodreads CSV export — round-trippable:** `exportToGoodreadsCSV` now emits Goodreads' native column set (`Number of Pages`, `Exclusive Shelf`, `Bookshelves`, `="ISBN"` wrappers) and maps `finishedAt` → `Date Read` and `pageCount` → `Number of Pages`, with RFC 4180 quoting and CRLF line endings. Full round-trip through `importFromGoodreadsCSV` preserves title / author / ISBN / status / pageCount / notes / dateAdded / finishedAt.
- **Sync conflict visibility (Phase 30 continuation):** `useSyncQueue` stores `lastConflictBookIds` alongside `hadConflictLastSync`; `mergeSync` records the specific ids of books whose local and remote versions differed. Profile Settings expands the conflict warning into a list of affected titles with an Open deep-link per book. Dismiss clears both fields.
- **Accessibility CI gate (Phase 32):** `e2e/a11y.spec.ts` runs `@axe-core/playwright` against home / library / data / profile (WCAG 2.0/2.1 A/AA). Fails on `critical` violations; logs `serious` as warnings. Wired into `test:e2e:release`.
- **Vercel deploy visibility:** `Verify Vercel deploy secrets` step emits a `::warning::` when `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` are missing so the silent-skip no longer looks like a successful deploy.
- **Deploy-failure alerting:** `notify-deploy-failure` job posts to optional `DEPLOY_ALERT_WEBHOOK` (Slack/Discord-compatible) when `deploy-pages` or `deploy-vercel` fails on `main`.

### UX refinements (Aug 2026)

- **Swipe-down to dismiss BookDetail:** new `useSwipeToDismiss` hook (threshold + horizontal-drift rejection + at-top arming) applied to the BookDetail modal so touch users can flick it closed like a sheet. 6 hook tests + 2 component tests.
- **Batch-scan session summary with undo (roadmap B5):** batch adds now toast a running count ("Added — 3 books this session") with an **Undo** action that removes that book and decrements the counter; navigating away from the scanner shows "Batch complete — you added N books this session." Copy helpers in `src/utils/batchSession.ts` with tests.
- Mobile UX audit checklist synced with reality (bottom nav, skeletons, `touch-action` were shipped but unchecked); pull-to-refresh is the only remaining item.

### Phase 26 close-out + coverage repair (Aug 2026)

- **Missing-cover recovery (Phase 26 final slice):** `findBooksMissingCovers` / `extractCoverUpdate` in `src/utils/missingCovers.ts` — targets books without a real cover (including those stuck on the fallback placeholder), skipping photo-only books and user-edited covers. "Recover missing covers (N)" button in Data → Refresh Metadata re-queries only those books and applies **only** the cover field, sharing the existing progress/cancel UI. 11 utility tests + 4 component tests.
- **Sync error-path tests (Issue #41):** `syncBooksRemote.test.ts` — 17 tests covering `pullBooks`/`pullShelves` failures, `pushBooks` upsert/fetch/delete-stale failures and empty-library pruning, `pushShelves` failures, and `mergeSync` conflict detection, pull/push failure short-circuits, and shelf fallback. `syncBooks.ts` branch coverage 50% → 86%.
- **Coverage config repair:** `src/pwa/**` excluded from coverage (the `virtual:pwa-register` import can't be transformed outside the PWA build, producing a parse error on every coverage run). Thresholds reset to the measured baseline (58/47/47/60) with a dated comment — the old thresholds (65/55/62/67) had silently gone red as untested UI surface (`App.tsx`, `HomeFeed.tsx`) grew, so `npm run test:coverage` was failing on main.

### Phase 30/32/33/34 wave (May 2026)

- **Schema migration runner (Phase 30):** `src/lib/schemaMigrations.ts` — `CURRENT_SCHEMA_VERSION` + `migrateBook`/`migrateBooks` runner (idempotent, safe on unknown versions). Wired into `useBookStore.persist.merge` and `syncBooks.pullBooks`/`mergeSync` so adding new `BookEntry` fields won't break older clients. 9 unit tests.
- **High-contrast theme (Phase 32):** `'high-contrast'` added to `ProfilePreferences.theme` union. WCAG AAA palette in `:root[data-theme="high-contrast"]` (black bg, white text, `#ffeb3b` primary, `#00ffff` accent, full white borders). `useTheme` cycles `light → dark → system → high-contrast`. `ThemeToggle` redesigned as rotating-icon button with proper aria-labels. Theme picker in ProfileSettings extended.
- **Reduced-motion audit (Phase 32):** Global `@media (prefers-reduced-motion: reduce)` clamp in `src/index.css` covering the whole tree; previously-unguarded animations in `BookCard.module.css`, `PasswordReset.module.css`, and `torch.css` wrapped in `@media (prefers-reduced-motion: no-preference)`.
- **Notion CSV export (Phase 33):** `exportToNotionCSV` in `exportFormats.ts` — header `Title,Author,ISBN,Status,Pages,Pages Read,Started,Finished,Series,Series #,Notes,Date Added`. ISO dates → `YYYY-MM-DD`. Status capitalization (`To Read`/`Reading`/`Read`/`DNF`). CRLF line endings, RFC 4180 escaping, multi-line notes flattened to ` / `. "Export to Notion (CSV)" button in `DataManagement`. 13 unit tests.
- **Privacy controls (Phase 34):** `analyticsOptIn` (default `false`) on `ProfilePreferences`; `useAnalyticsStore.track()` short-circuits unless opted in. `deleteAllCloudData(userId)` in `syncBooks.ts` wipes books, shelves, and the profile row. Profile → Privacy section adds the toggle and a destructive "Delete all my data" button (cloud + local + sign-out + reload). Privacy page copy updated. 8 unit tests.
- **Onboarding tour (Phase 34):** `OnboardingModal` rewritten as a 4-step tour (Welcome / Scan / Organize / Sync) with Back/Next/Skip/Done, step dots, focus trap, Escape-to-skip, `role="dialog"`/`aria-modal="true"`/`aria-label="Welcome tour"`. App wiring marks `onboardingCompleted: true` on close. 10 unit tests.
- **Fix:** `useBookStore.updateBookStatus` only advances streak if the target book exists (prevented stale book IDs from spuriously incrementing).
- **Fix:** `useBookStore.bulkUpdateStatus` now advances streak once per call when marking `read`/`reading`, mirroring single-book behavior.
- **Fix:** `useBookLookup.refreshMetadata` filters out `book.userEditedFields` so manual edits aren't overwritten on bulk refresh.

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
