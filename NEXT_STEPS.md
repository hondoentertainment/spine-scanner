# Spine Scanner - Next Steps

Status of recommended improvements. Items marked completed are implemented.

---

## Recommended Immediate Actions

These are the highest-value, lowest-risk improvements based on the current codebase audit.

### 1. ~~Fix remaining mobile touch target issues~~ ✅ Complete

~~The MOBILE_UX_AUDIT identified two pending items that affect real-device usability:~~

- ~~Add `min-height: 44px; min-width: 44px` to `.navBtn` in `App.module.css`~~
- ~~Add `touch-action: manipulation` to all buttons and links in `index.css`~~

Both were already implemented in `App.module.css` and `index.css`. MOBILE_UX_AUDIT.md checklist updated.

### 2. ~~Build the analytics dashboard UI~~ ✅ Complete

Added a **Scan statistics panel** to `ProfileSettings.tsx`. It uses `useAnalyticsStore.getSummary()` (read-only) and surfaces:

- Total scans and colour-coded success rate (green ≥ 75%, amber ≥ 50%, red below)
- Barcode vs OCR hit counts
- Visual method-split bar (barcode = indigo, OCR = remainder)

The panel is hidden when `totalScans === 0` to avoid cluttering new installs. Responsive grid collapses to 2 columns on narrow viewports.

### 3. ~~Phase 25 — Scan Accuracy Hardening~~ ✅ Complete

Progress within Phase 25:

1. **Confidence scoring** ✅ Already done — `ScanConfidenceBand` (`low` / `medium` / `high`) computed in `useScanPipeline` and surfaced in the Scanner UI via the `scanHealthCard` panel. Tests existed in `useScanPipeline.test.ts`.
2. **Regression fixture test suite** ✅ Added — `src/hooks/__tests__/scanRegressionFixtures.test.ts` covers: dim-light capture, glossy/over-exposed cover, partial barcode with checksum-repair, rotated spine (90°/270° pass), low-resolution (move-closer), and confidence band mapping (low/medium/high).
3. **OCR diagnostics panel** ✅ Already done — `DebugPanel.tsx` exposes live telemetry and timestamped scan logs, toggled by the terminal icon in the scanner toolbar.
4. **Device benchmark runner** ✅ Added — `scripts/benchmark-scan.mjs` runs the scan pipeline against fixture images and outputs a CSV with timing, success, and extracted ISBN. Run via `npm run benchmark`.

### 4. ~~Phase 26 — Metadata Quality Layer~~ ✅ Complete (core)

Metadata quality tracking is now implemented:

- ✅ `metadataSource` field (`google_books` | `open_library` | `manual` | `import`) stored per book entry in `BookEntry` type.
- ✅ `userEditedFields` array tracks which fields the user has manually edited.
- ✅ Source badge displayed in `BookDetail` with color-coded pills (Google Books = blue, Open Library = green, Manual = amber, Import = purple).
- ✅ "Refresh metadata" button in `BookDetail` re-queries APIs but never overwrites user-edited fields.
- ✅ All book creation sites in `App.tsx` and `DataManagement.tsx` set `metadataSource` appropriately.
- ✅ `useBookLookup` hook returns `source` field and exposes `refreshMetadata` function.
- ✅ 25 new tests across 4 test files covering metadata source tracking, refresh logic, store persistence, and export compatibility.

Remaining Phase 26 items for future work:
- Conflict resolution UI when Google Books and Open Library disagree on author or page count.
- Edition-aware matching.
- Bulk metadata refresh.
- Missing-cover recovery flow.

### 5. ~~Phase 27 — Reading Workflow Expansion~~ ✅ Complete

- ✅ Reading progress fields added to `BookEntry`: `pagesRead`, `progressPercent`, `startedReading`, `finishedReading`, `rating`
- ✅ `ReadingProgress` component in `BookDetail` with progress bar, page input, Start Reading / Finish buttons, 1-5 star rating
- ✅ `ReadingStatsPanel` for `ProfileSettings` with yearly stats, monthly chart, streak tracking, rating distribution
- ✅ `readingStats.ts` utility: `calculateReadingStats`, `getReadingStreak`, `getMonthlyReadingCounts`
- ✅ Tests for reading stats and ReadingProgress component

### 6. ~~Phase 28 — Collections and Smart Shelves~~ ✅ Complete

- ✅ `SmartShelf` and `SmartShelfRule` types added with rule-based filtering (status, author, title, pageCount, dateAdded, rating, metadataSource)
- ✅ `smartShelfEngine.ts`: `bookMatchesSmartShelf`, `getBooksForSmartShelf`, built-in templates
- ✅ Smart shelves CRUD in `useBookStore` (addSmartShelf, updateSmartShelf, removeSmartShelf)
- ✅ `SmartShelfEditor` component with rule builder, template picker, live preview
- ✅ `BulkActions` component for multi-select operations (change status, assign shelf, remove)
- ✅ Tests for smart shelf engine and SmartShelfEditor component

### 7. ~~Phase 29 — Social and Household Sharing~~ ✅ Complete

- ✅ `LendingRecord` and `ActivityEntry` types for book loans and activity tracking
- ✅ `useLendingStore`: addRecord, returnBook, getActiveLoans, getOverdueLoans, getBookLendingHistory
- ✅ `useActivityStore`: addEntry, getRecentEntries (FIFO capped at 500)
- ✅ `LendingPanel` component for BookDetail: lend form, active loan status, return button, lending history
- ✅ `ActivityFeed` component: timeline of library events with icons and relative timestamps
- ✅ `lendingUtils.ts`: isBookLent, getActiveLoan, isOverdue, getDaysUntilDue, getLendingSummary
- ✅ Tests for lending store, activity store, and lending utils

### 8. ~~Phase 30 — Cloud Sync V2~~ ✅ Complete

- ✅ `useSyncHistoryStore`: sync history tracking with timestamps, status, duration (capped at 100)
- ✅ Last-good snapshot save/restore for recovery
- ✅ `syncConflictResolver.ts`: detectConflicts, resolveConflicts, autoResolveConflicts
- ✅ `SyncHistoryPanel` component: recent sync operations list with status icons and details
- ✅ `SyncConflictDialog` component: side-by-side conflict resolution with local/remote/manual picks
- ✅ `OfflineQueueInspector` component: pending changes, sync status, discard/retry actions
- ✅ Tests for sync conflict resolver and sync history store

### 9. ~~Phase 31 — Insights and Recommendations~~ ✅ Complete

- ✅ `insightsEngine.ts`: favorite authors, backlog analysis, completion rates, fun facts generator, next read suggestions
- ✅ `duplicateDetector.ts`: ISBN duplicates, similar title detection, Levenshtein similarity, title normalization
- ✅ `InsightsPanel` component: top authors chart, backlog card, fun facts, suggested reads, duplicate detection
- ✅ `YearInBooks` component: exportable year-in-review with monthly chart, top authors, share text generation
- ✅ Tests for insights engine and duplicate detector

---

## Completed

| # | Item | Status |
|---|------|--------|
| 1 | TypeScript build errors | Completed |
| 2 | Test coverage | Completed - 266 unit tests, Playwright E2E, mobile matrix |
| 3 | ISBN checksum validation | Completed - `isbnValidation.ts` |
| 4 | API resilience & caching | Completed - Retry, cache, debounce, Open Library fallback |
| 5 | Barcode scanning | Completed - ZXing + OCR pipeline |
| 6 | Library sorting & filtering | Completed - Sort, status filter, shelves, stats |
| 7 | JSON export/import | Completed - Full backup/restore |
| 8 | README & docs | Completed |
| 9 | Offline / PWA support | Completed - `vite-plugin-pwa`, service worker |
| 10 | Test step in deploy workflow | Completed - `npm run test` before build |
| 11 | Duplicate scan "Update notes" | Completed - Confirm dialog -> Open in library |
| 12 | PWA icons (192, 512) | Completed - Generated from SVG |
| 13 | LibraryThing TSV, StoryGraph CSV | Completed - Export formats |
| 14 | Accessibility: aria-labels, focus ring | Completed - Icon buttons, nav, shelf chips |
| 15 | Amazon affiliate tag | Completed - `VITE_AMAZON_AFFILIATE_TAG` in `.env` |
| 16 | Individual book sharing | Completed - Share button, Web Share API, copy link, deep links `#book-ISBN` |
| 17 | Camera torch | Completed - Flashlight toggle for low light (mobile) |
| 18 | Scanner UX | Completed - Haptics, faster auto-scan, OCR pre-warm |
| 19 | Version 1.0.0 | Completed - `package.json` version bumped |
| 20 | Vitest coverage | Completed - `@vitest/coverage-v8`, `npm run test:coverage`, CI reports |
| 21 | Accessibility: skip link, focus trap, reduced motion | Completed - Skip link, modal focus trap, reduced motion, SR announcements |
| 22 | Grid view virtualization | Completed - `@tanstack/react-virtual` for 1000+ book libraries |
| 23 | Client-side usage analytics | Completed - `useAnalyticsStore` with aggregated summary |
| 24 | Error monitoring (Sentry) | Completed - Optional env-gated `@sentry/react` integration |

---

## Roadmap: Next 10 Phases

| # | Phase | Goal | Key deliverables |
|---|-------|------|------------------|
| 25 | Scan Accuracy Hardening | Reduce failed scans and shorten time-to-add on real devices | Device-based scanner benchmark set, confidence scoring in pipeline, low-light / glare presets, OCR diagnostics surfaced in UI, regression suite for difficult covers and barcodes |
| 26 | Metadata Quality Layer | Make imported book data more trustworthy and editable in bulk | Metadata source attribution, conflict resolution when Google/Open Library disagree, edition-aware matching, bulk metadata refresh, missing-cover recovery flow |
| 27 | Reading Workflow Expansion | Turn the library into an active reading tracker instead of just a catalog | Reading sessions, progress percent / pages finished, start-finish dates, quick status actions, reading streak / yearly goals, richer stats cards |
| 28 | Collections and Smart Shelves | Help users organize large libraries without manual tagging overhead | Rule-based shelves, saved searches, shelf templates, sort presets, multi-select bulk actions, archive / hidden shelf support |
| 29 | Social and Household Sharing | Support shared libraries across families, clubs, or small teams | Household mode, lend/borrow tracking, shared shelves, permissions for viewers vs editors, activity feed for collaborative changes |
| 30 | Cloud Sync V2 | Make sync safer, clearer, and more resilient across devices | Sync history panel, conflict UI, offline queue inspector, background retry strategy, last-good snapshot restore, migration tooling for schema changes |
| 31 | Insights and Recommendations | Surface useful patterns from the user's own library behavior | Personalized recommendations from owned books, unread backlog insights, duplicate / edition detection, series completion hints, exportable reading reports |
| 32 | Accessibility and Inclusive UX | Reach a production-ready accessibility bar across devices | Real-device VoiceOver / NVDA audits, larger touch-target pass, high-contrast mode, motion controls, keyboard-only scanner alternatives, accessibility CI checks |
| 33 | Platform Integrations | Connect Spine Scanner to the rest of a reader's ecosystem | Native importers for Goodreads / StoryGraph history, calendar export for reading goals, Notion / CSV automation endpoints, optional webhook events, richer share targets |
| 34 | Release Readiness and Growth | Prepare the app for broader public launch and ongoing maintenance | In-app onboarding, feature flags, changelog / release notes view, support diagnostics bundle, privacy controls, admin telemetry dashboard, deployment / rollback playbooks |

---

## Notes by Phase

### Phase 25 - Scan Accuracy Hardening
- Prioritize the top 20 scan failure patterns from real device testing before adding new scan modes.
- Add fixtures for glossy covers, partial barcodes, rotated spines, and dim-light captures.
- Define a measurable target such as scan success rate and median time-to-add.

### Phase 26 - Metadata Quality Layer
- Keep manual edits first-class so metadata refreshes never overwrite user-authored fields silently.
- Store source and confidence per field where practical.
- Treat cover image repair as part of metadata quality, not just visual polish.

### Phase 27 - Reading Workflow Expansion
- Build around lightweight interactions so the app stays fast during scanning sessions.
- Prefer one-tap progress logging and status updates from the library view.
- Let stats remain useful offline.

### Phase 28 - Collections and Smart Shelves
- Start with saved filters built on current shelf/status/search logic.
- Add bulk edit flows only after selection UX is solid on mobile.
- Keep manual shelves and smart shelves visually distinct.

### Phase 29 - Social and Household Sharing
- Begin with simple trusted sharing before broader public discovery features.
- Model ownership clearly so edits and deletes remain reversible.
- Include book lending reminders as a small but high-value early feature.

### Phase 30 - Cloud Sync V2
- Ship visibility before complexity: users should understand pending changes and conflicts.
- Add recovery tooling before pushing more aggressive background sync behavior.
- Test multi-device edits explicitly in CI and manual QA.

### Phase 31 - Insights and Recommendations
- Use only library-owned and user-entered data by default.
- Keep recommendation logic explainable: show why a title or trend is being surfaced.
- Exportable summaries can double as shareable year-in-books reports.

### Phase 32 - Accessibility and Inclusive UX
- Treat scanner accessibility as more than labels: guidance, alternatives, and feedback all matter.
- Add real assistive tech validation to the release checklist.
- Consider dyslexia-friendly typography and clearer error wording where it helps.

### Phase 33 - Platform Integrations
- Focus on integrations users already rely on for book tracking first.
- Keep external integrations optional and easy to revoke.
- Use stable import/export contracts before adding automation hooks.

### Phase 34 - Release Readiness and Growth
- Feature flags should gate unfinished capabilities without branching the UX too heavily.
- Support tooling should help debug sync, scan, and metadata issues quickly.
- Pair launch work with a maintenance plan so reliability keeps up with adoption.

---

## Still Worth Doing Alongside the Roadmap

### Accessibility
- Screen reader testing (VoiceOver / NVDA) on real devices

### Optional polish
- Individual book sharing: card image export
- ~~Analytics dashboard UI panel (data is tracked; display panel is still future)~~ ✅ Done — scan stats panel added to Profile view

---

## Archived

This doc previously listed many items as recommended next steps. Those have been implemented. The phases above extend the roadmap beyond the completed core app work.
