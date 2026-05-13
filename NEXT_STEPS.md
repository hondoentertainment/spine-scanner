# Spine Scanner - Next Steps

Status of recommended improvements. Items marked ✅ are implemented and shipped.

---

## Recently Shipped (this wave)

| Phase | Item | Status |
|-------|------|--------|
| 25 | Scan Accuracy Hardening — benchmark runner closes the phase | ✅ |
| 26 | Metadata Quality Layer — source attribution, conflict detection, safe refresh | ✅ |
| 26 | Bulk metadata refresh in DataManagement (Issue #47) | ✅ |
| 26 | Edition-level duplicate detection — title+author across ISBNs (Issue #53) | ✅ |
| 27 | Pages-read input in BookDetail edit mode (Issue #43) | ✅ |
| 27 | Reading streak tracking (Issue #42) + timezone-correct date logic (Issue #51) | ✅ |
| 27 | Year in Books stats card (Issue #49) | ✅ |
| 27 | **Reading session log** — `useReadingSessionStore`, Start/Stop timer on BookCard, session history + stats in BookDetail | ✅ |
| 28 | Bulk multi-select in LibraryList (Issue #50) | ✅ (already shipped) |
| 30 | Sync status panel in ProfileSettings (Issue #45) | ✅ |
| 30 | **Sync resilience** — `withRetry` exponential backoff, pre-push snapshot + restore, conflict detection | ✅ |
| 31 | Series completion hints in HomeFeed (Issue #46) | ✅ |
| 33 | Goodreads CSV import (Issue #44) | ✅ |
| 33 | **StoryGraph CSV import** — all statuses, dates, series | ✅ |
| 33 | **ICS calendar export** — RFC 5545, one VEVENT per finished book | ✅ |
| 34 | **Feature flag scaffolding** — `FEATURE_FLAGS` + `useFeatureFlag(name)` with localStorage override | ✅ |
| 34 | **In-app changelog** — `ChangelogModal` + "What's new" in Profile | ✅ |
| 34 | **Diagnostics download** — one-click `spinescanner-diagnostics-YYYYMMDD.json` bundle | ✅ |
| — | E2E coverage for the new wave (Issue #52) | ✅ |
| — | Branch coverage uplift, raised vitest thresholds (Issue #41) | ✅ |
| — | Tooling: ESLint and Vitest exclude `.claude/**` so agent worktrees don't contaminate local runs | ✅ |
| — | CI: auto-deploy to GitHub Pages + Vercel on push to main | ✅ |

---

## Open priorities (next wave)

### 1. Issue #40 — Production launch (highest priority, gates everything else)

The product is feature-complete enough to ship. The remaining work is config and verification, not code:

- Set real values for `VITE_SITE_URL`, `VITE_BASE_PATH`, `VITE_SUPPORT_EMAIL`, `VITE_SENTRY_DSN`, `VITE_APP_ENV=production`
- Apply Supabase migrations to production
- Full pre-flight: `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e:release`
- Smoke test on real iOS Safari + Android Chrome
- Submit `sitemap.xml` to Search Console post-deploy

Owner: human (needs deploy access).

### 2. Phase 29 — Social and Household Sharing

Begin with simple trusted sharing before broader discovery:

- Household mode: invite users by email to share a library (read-only or editor)
- Lend/borrow tracking: mark a book as lent to a named contact with an optional due date
- Shared shelves: one shelf visible across a household
- Viewer/editor permission model with per-book visibility

### 3. Phase 30 continuation — sync schema migrations

Backoff, snapshot, and conflict detection are shipped. Still missing:

- Schema migration tooling: adding new fields to `BookEntry` must not break older clients still syncing
- Explicit migration log in release notes + a migration runner on sign-in
- Multi-device concurrent-edit test coverage in CI

### 4. Phase 32 — accessibility production audit

The codebase has solid `aria-label` coverage and a focus trap. The gap is *real assistive-tech validation*:

- Run a full VoiceOver pass on iOS Safari (scan flow, library, BookDetail)
- Run an NVDA pass on Windows Chrome
- Add a high-contrast theme variant
- Verify keyboard-only access to the scanner (no mouse-only paths)
- `prefers-reduced-motion` audit on animations

### 5. Phase 33 expansion — remaining integrations

StoryGraph and ICS shipped. Remaining:

- Notion database export (CSV-compatible column mapping)
- Webhook events for sync-server integrations (post-launch)

### 6. Phase 34 continuation — privacy controls

Feature flags, changelog, and diagnostics shipped. Remaining:

- Explicit opt-in for analytics with a clear toggle in Profile
- Easy data-deletion path: one-button clear of all analytics + localStorage
- Onboarding tour for first-time users (gated behind `onboardingCompleted` flag already in preferences)

---

## Roadmap: phases beyond this wave

| # | Phase | Goal | Key remaining deliverables |
|---|-------|------|------------------|
| 27 | Reading Workflow Expansion | Active reading tracker | ✅ Complete (streaks, Year in Books, session log + timer shipped) |
| 29 | Social and Household Sharing | Shared libraries across families/clubs | Household mode, lend/borrow tracking, shared shelves, viewer/editor permissions, activity feed |
| 30 | Cloud Sync V2 (partial) | Safe, clear, resilient sync | Schema migrations, multi-device test coverage |
| 31 | Insights and Recommendations (partial) | Useful library patterns | Personalised recs from owned books, unread-backlog insights, exportable yearly reading reports |
| 32 | Accessibility and Inclusive UX | Production accessibility bar | Real VoiceOver/NVDA audits, high-contrast theme, motion controls, keyboard-only scanner, accessibility CI checks |
| 33 | Platform Integrations (partial) | Connect to reader ecosystems | Notion / webhook automation, richer share targets |
| 34 | Release Readiness and Growth (partial) | Broad public launch + maintenance | Onboarding tour, analytics opt-in, privacy controls, admin telemetry, deploy/rollback playbooks |

Phases 25, 26, 27, and 28 are now substantially complete. Phase 30 is mostly done (backoff, snapshot, conflict detection shipped; schema migrations ahead). Phase 31 is partly started (series hints + duplicates shipped; recommendations ahead). Phase 33 is partly started (Goodreads + StoryGraph import, ICS export shipped). Phase 34 is partly started (feature flags, changelog, diagnostics shipped).

---

## Notes by Phase (still active)

### Phase 27 - Reading Workflow Expansion (continuation)
- Sessions should be optional, not required — a user who only marks status changes shouldn't see a worse experience.
- Keep one-tap progress logging from the library view (already shipped via BookCard +25 pages).
- Goal pacing should remain useful offline.

### Phase 29 - Social and Household Sharing
- Begin with simple trusted sharing before broader public discovery features.
- Model ownership clearly so edits and deletes remain reversible.
- Include book lending reminders as a small but high-value early feature.

### Phase 30 - Cloud Sync V2 (continuation)
- We have visibility (#45). Add recovery tooling next, *before* pushing more aggressive background sync behavior.
- Test multi-device edits explicitly in CI and manual QA.
- Make schema migrations explicit in release notes.

### Phase 31 - Insights and Recommendations (continuation)
- Use only library-owned and user-entered data by default.
- Keep recommendation logic explainable: show *why* a title is surfaced.
- Exportable summaries can double as shareable year-in-books reports — we already track the data.

### Phase 32 - Accessibility and Inclusive UX
- Treat scanner accessibility as more than labels: guidance, alternatives, and feedback all matter.
- Add real assistive-tech validation to the release checklist.
- Consider dyslexia-friendly typography and clearer error wording where it helps.

### Phase 33 - Platform Integrations (continuation)
- StoryGraph and Calendar are the two highest-value remaining adapters.
- Keep external integrations optional and easy to revoke.
- Use stable import/export contracts before adding automation hooks.

### Phase 34 - Release Readiness and Growth
- Feature flags should gate unfinished capabilities without branching the UX too heavily.
- Support tooling should help debug sync, scan, and metadata issues quickly.
- Pair launch work with a maintenance plan so reliability keeps up with adoption.

---

## Reference

- `PRODUCTION_PLAN.md` — phased plan focused on launch readiness
- `LAUNCH_CHECKLIST.md` — release-day checklist
- `CHANGELOG.md` — all shipped changes, including this wave under **Unreleased**

---

## Completed (foundational, pre-roadmap)

| # | Item | Status |
|---|------|--------|
| 1 | TypeScript build errors | Completed |
| 2 | Test coverage | Completed - unit + Playwright + mobile matrix |
| 3 | ISBN checksum validation | Completed - `isbnValidation.ts` |
| 4 | API resilience & caching | Completed - retry, cache, debounce, Open Library fallback |
| 5 | Barcode scanning | Completed - ZXing + OCR pipeline |
| 6 | Library sorting & filtering | Completed - sort, status filter, shelves, stats |
| 7 | JSON export/import | Completed - full backup/restore |
| 8 | README & docs | Completed |
| 9 | Offline / PWA support | Completed - `vite-plugin-pwa`, service worker |
| 10 | Test step in deploy workflow | Completed - `npm run test` before build |
| 11 | Duplicate scan "Update notes" | Completed - confirm dialog → open in library |
| 12 | PWA icons (192, 512) | Completed - generated from SVG |
| 13 | LibraryThing TSV, StoryGraph CSV | Completed - export formats |
| 14 | Accessibility: aria-labels, focus ring | Completed - icon buttons, nav, shelf chips |
| 15 | Amazon affiliate tag | Completed - `VITE_AMAZON_AFFILIATE_TAG` in `.env` |
| 16 | Individual book sharing | Completed - Web Share API, copy link, deep links `#book-ISBN` |
| 17 | Camera torch | Completed - flashlight toggle for low light (mobile) |
| 18 | Scanner UX | Completed - haptics, faster auto-scan, OCR pre-warm |
| 19 | Version 1.0.0 | Completed - `package.json` version bumped |
| 20 | Vitest coverage | Completed - `@vitest/coverage-v8`, `npm run test:coverage`, CI reports |
| 21 | Accessibility: skip link, focus trap, reduced motion | Completed |
| 22 | Grid view virtualization | Completed - `@tanstack/react-virtual` for 1000+ book libraries |
| 23 | Client-side usage analytics | Completed - `useAnalyticsStore` with aggregated summary |
| 24 | Error monitoring (Sentry) | Completed - optional env-gated `@sentry/react` integration |
