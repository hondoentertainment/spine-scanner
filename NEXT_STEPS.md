# Spine Scanner - Next Steps

Status of recommended improvements. Items marked completed are implemented.

---

## Recommended Immediate Actions (updated 2026-07-28)

Based on an audit of the codebase, CI history, and repository state at `c75e612` (main, CI green). The headline: **feature work is well ahead of this doc — the current bottlenecks are repo hygiene and launch operations, not new features.**

### 1. ~~Triage the open pull request backlog~~ ✅ In progress

April drafts (#48/#50/#61/#64/#65) and the superseded Copilot coverage PR (#60) are closed. Dependabot bumps (#79/#80 and related) were closed after landing. Remaining work from this list:

- **#83 (Deploy hardening + a11y CI gate + Goodreads round-trip + sync conflict list)** — rebased onto current `main` and landing now. Does not replace this doc's Aug 2026 audit.

### 2. Complete the production launch checklist (Issue #40)

The app is feature-complete for v1, but launch configuration is not done: real `VITE_SITE_URL` / `VITE_BASE_PATH` / `VITE_SUPPORT_EMAIL`, production Sentry DSN, Supabase production keys/migrations, Vercel secrets (CI currently skips the Vercel deploy when the token is absent — see #81), and a real-device mobile validation pass. This is the actual blocker between "done" and "launched"; everything in `LAUNCH_CHECKLIST.md` should be walked once, end to end.

### 3. Raise branch coverage from 49% toward 65% (Issue #41) — in progress

Updated finding (2026-08-04): most files named in the issue are now well covered (`useBookLookup` 86% branches, `importLogic` 85%, `useScanPipeline` 75%, `useAuthStore` 72%). `syncBooks.ts` was the laggard at 50% branches / 33% statements — now 86% / 92% after `syncBooksRemote.test.ts` landed. The remaining lever is the **zero-coverage UI components**: `App.tsx` (~1,000 lines, no test file at all), `HomeFeed.tsx`, and most of `DataManagement.tsx`. Note: coverage totals had drifted below the configured thresholds without anyone noticing because CI doesn't run `test:coverage` — thresholds were reset to the measured baseline (58/47/47/60); ratchet them up as component tests land, and consider adding a coverage step to CI so this can't silently regress again.

### 4. ~~Finish the last slice of Phase 26: missing-cover recovery~~ ✅ Complete

Shipped: `src/utils/missingCovers.ts` + a "Recover missing covers" action in Data → Refresh Metadata. It targets books without a real cover (including the fallback placeholder), skips photo-only books and user-edited covers, and applies only the `coverImg` field from the refreshed metadata. **Phase 26 is now fully closed.**

### 5. Keep an eye on OCR E2E stability in CI

Main had four consecutive red runs in June from OCR E2E timeouts before #78/#81 fixed them (heavy OCR now runs integration-only). CI has been green since, but this suite has a flake history — if it reds again, prefer tightening fixtures/timeouts over re-widening what runs on every push.

### After that: Phase 30 (Cloud Sync V2) before Phase 29 (Household Sharing)

Phases 26–28 are essentially shipped (see below), so the roadmap cursor sits at Phase 29. Recommendation: **take Phase 30 first.** Household sharing builds directly on sync being trustworthy — conflict UI, offline queue visibility, and last-good-snapshot restore should exist before multiple people can write to the same library.

---

## Recommended Next Feature Set (2026-08-04): "Sync Trust & Sharing Foundations"

With Phases 25–28 closed and much of 30–34 already landed piecemeal, the next coherent feature set should finish sync trust and lay the first sharing bricks — in this order:

1. **Cloud Sync V2 completion (Phase 30 remainder).** The resilience layer shipped (retry backoff, pre-push snapshot, conflict *flag*), but conflicts still silently resolve local-wins. Build: a per-book conflict resolution UI (show both versions, pick or merge), a sync history panel (last N syncs with outcome), and an offline queue inspector surfaced from the existing Sync status panel.
2. **Loan / borrow tracking (roadmap B4 — the gateway to Phase 29).** Table stakes for home-library apps and the smallest useful slice of "sharing": lend a book to a named person with an optional due date, a "Lent out" smart shelf, and a due-soon reminder card in HomeFeed. Models ownership cleanly before full household mode.
3. **Library search polish (B1 remainder).** Recent-search recall exists; still missing are match highlighting in results and richer empty-state CTAs ("no matches — scan it now?").
4. **Pull-to-refresh for the library (last open mobile-audit item).** Trigger a sync pull on signed-in accounts; simple spinner affordance otherwise.
5. **Insights export (Phase 31 remainder).** Unread-backlog insights and a shareable "Year in Books" card image — turns existing stats into a growth loop.

Skipped deliberately: full Phase 29 household mode (needs the conflict UI first) and native wrappers (D3 — PWA limits haven't bitten yet).

### UX refinements shipped with this recommendation (2026-08-04)

- **Swipe-down to dismiss BookDetail** on touch devices (`useSwipeToDismiss` hook) — only arms when the modal's scroll body is at the top, so scrolling content never accidentally closes it.
- **Batch-scan session summary + undo (roadmap B5)** — each batch add now shows a running count with an **Undo** action, and leaving the scanner surfaces "Batch complete — you added N books this session."
- Mobile UX audit refreshed: bottom nav, skeleton loaders, and `touch-action` were already shipped but unchecked; pull-to-refresh is the only remaining item.

---

## Previous Immediate Actions (all complete)

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

1. **Confidence scoring** ✅ — `ScanConfidenceBand` (`low` / `medium` / `high`) computed in `useScanPipeline` and surfaced in the Scanner UI via the `scanHealthCard` panel. Tests in `useScanPipeline.test.ts`.
2. **Regression fixture test suite** ✅ — `src/hooks/__tests__/scanRegressionFixtures.test.ts` covers dim-light capture, glossy/over-exposed cover, partial barcode with checksum-repair, rotated spine (90°/270° pass), low-resolution (move-closer), and confidence band mapping.
3. **OCR diagnostics panel** ✅ — `DebugPanel.tsx` exposes live telemetry and timestamped scan logs, toggled by the terminal icon in the scanner toolbar.
4. **Device benchmark runner** ✅ — `scripts/benchmark-scan.test.ts` runs the pipeline against fixture scenarios with mocked OCR/barcode and emits `scan-benchmark.csv` (fixture, scenario, detection method, confidence band, latency, pass/fail). Run with `npm run bench:scan`. Replace the mocked stages with captured device frames + real Tesseract to produce on-device numbers.

### 4. Phase 26 — Metadata Quality Layer ✅ Complete

Foundation slice landed:

1. **Source attribution** ✅ — `metadataSource: 'google_books' | 'open_library' | 'manual'` on `BookEntry`, populated by `useBookLookup` (per-provider) and by all add paths in `App.tsx` and `DataManagement.tsx`.
2. **Source badge in `BookDetail`** ✅ — read-only chip in the meta block showing where the data came from.
3. **Refresh metadata action** ✅ — re-queries the APIs and merges results, but skips any field flagged in `userEditedFields`. `BookDetail.handleSave` now sets that flag for `title`, `author`, `pageCount`, and `coverImg` whenever the value changes.

Since then, most of the remaining Phase 26 scope has also shipped:

- **Conflict UI** ✅ — `MetadataConflictPanel.tsx` surfaces disagreements between Google Books and Open Library.
- **Edition-aware matching** ✅ — `editionDuplicates.ts` catches hardcover/paperback/unabridged duplicates of the same book.
- **Bulk metadata refresh** ✅ — refresh-all flow with progress and cancel in `DataManagement.tsx`.

- **Missing-cover recovery** ✅ — `missingCovers.ts` + "Recover missing covers" action in `DataManagement.tsx`; cover-only updates, photo-only and user-edited covers excluded.

Phase 26 is fully closed.

### 5. Phases 27 & 28 — shipped

Both landed ahead of this doc:

- **Phase 27 (Reading Workflow)** ✅ — `useReadingSessionStore.ts`, per-book pages read, started/finished dates, current/longest streaks, and the "{year} in Books" card.
- **Phase 28 (Collections & Smart Shelves)** ✅ — smart shelves, saved views, and bulk multi-select for status/shelf/delete (`LibraryList.tsx`, `types.ts`).

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
| 25 | Scan Accuracy Hardening ✅ | Reduce failed scans and shorten time-to-add on real devices | Device-based scanner benchmark set, confidence scoring in pipeline, low-light / glare presets, OCR diagnostics surfaced in UI, regression suite for difficult covers and barcodes |
| 26 | Metadata Quality Layer ✅ | Make imported book data more trustworthy and editable in bulk | Metadata source attribution ✅, conflict resolution when Google/Open Library disagree ✅, edition-aware matching ✅, bulk metadata refresh ✅, missing-cover recovery flow ✅ |
| 27 | Reading Workflow Expansion ✅ | Turn the library into an active reading tracker instead of just a catalog | Reading sessions, progress percent / pages finished, start-finish dates, quick status actions, reading streak / yearly goals, richer stats cards |
| 28 | Collections and Smart Shelves ✅ | Help users organize large libraries without manual tagging overhead | Rule-based shelves, saved searches, shelf templates, sort presets, multi-select bulk actions, archive / hidden shelf support |
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

- See `PRODUCTION_PLAN.md` for the launch-focused phased plan.
- See `LAUNCH_CHECKLIST.md` for the release-day checklist.

### Accessibility
- Screen reader testing (VoiceOver / NVDA) on real devices

### Optional polish
- Individual book sharing: card image export
- ~~Analytics dashboard UI panel (data is tracked; display panel is still future)~~ ✅ Done — scan stats panel added to Profile view

---

## Archived

This doc previously listed many items as recommended next steps. Those have been implemented. The phases above extend the roadmap beyond the completed core app work.
