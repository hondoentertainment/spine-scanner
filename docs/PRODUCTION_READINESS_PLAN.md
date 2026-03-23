# Production Readiness Plan — SpineScanner

> Generated 2026-03-23 · Baseline: v1.1.0

## Current State Summary

SpineScanner is a well-structured React/TypeScript PWA with solid foundations:
CI/CD via GitHub Actions, ~66% test coverage, Sentry error monitoring, offline-first
architecture, optional Supabase cloud sync, and automated deployment to GitHub Pages.

The gaps below are organized by **priority** (P0 = must-fix before launch,
P1 = should-fix soon after, P2 = quality-of-life improvements).

---

## P0 — Launch Blockers

### 1. Rate Limiting & Abuse Protection on External APIs

**Problem:** Google Books and Open Library calls have no client-side rate limiting.
A user rapidly scanning books or a malicious actor could trigger API bans.

**Action items:**
- Add a token-bucket or sliding-window rate limiter in `useBookLookup.ts` (e.g. max 10 req/s to Google Books).
- Show a user-facing toast when rate limited rather than silently failing.
- Consider proxying API calls through a lightweight edge function (Supabase Edge Function or Cloudflare Worker) to hide API keys and enforce server-side limits.

### 2. Content Security Policy (CSP) Header

**Problem:** No CSP is configured. The app loads scripts, styles, images, and WASM
from multiple origins (Google Books CDN, Open Library, jsdelivr, Sentry).

**Action items:**
- Add a strict CSP via `<meta>` tag in `index.html` or deploy headers file.
- Allowlist required origins (`*.googleapis.com`, `covers.openlibrary.org`, `cdn.jsdelivr.net`, Sentry ingest).
- Block `unsafe-inline` for scripts where possible (Vite outputs hashed modules).

### 3. localStorage Size Limits & Data Integrity

**Problem:** All local data lives in `localStorage` (typically 5–10 MB limit).
A large library (1000+ books with cover URLs, notes) could silently hit the cap,
causing data loss on write.

**Action items:**
- Migrate primary storage to **IndexedDB** (via `idb-keyval` or Dexie) for reliable
  multi-MB storage with transactional writes.
- Keep `localStorage` only for lightweight preferences (theme, sort order).
- Add a storage quota check on startup; warn users approaching limits.
- Add data integrity validation on load (schema version check, corrupt-entry recovery).

### 4. Accessibility (a11y) Audit

**Problem:** No automated or manual a11y testing is in place. Common issues in
camera-heavy PWAs include missing ARIA labels, focus traps in modals, and
insufficient color contrast.

**Action items:**
- Add `eslint-plugin-jsx-a11y` to the lint pipeline.
- Run Lighthouse accessibility audit; target score ≥ 90.
- Ensure all interactive elements are keyboard-navigable.
- Add `aria-live` regions for scan result announcements.
- Test with a screen reader (VoiceOver / TalkBack).

### 5. Privacy Policy & Terms of Service Content

**Problem:** `PublicInfoPage.tsx` renders privacy/terms pages, but the actual
legal content needs review for GDPR/CCPA compliance, especially around:
- Camera access and image processing (frames never leave the device — state this explicitly).
- Supabase data storage (what is stored, where, retention).
- Third-party API data sharing (ISBNs sent to Google/Open Library).
- Analytics event storage in `localStorage`.

**Action items:**
- Have legal counsel review privacy policy and ToS.
- Add a cookie/consent banner if analytics expand beyond local storage.
- Document data flow in a public-facing data practices page.

---

## P1 — Post-Launch High Priority

### 6. Raise Test Coverage to ≥ 80%

**Current:** statements 66.5%, branches 54.1%, functions 67.0%, lines 68.3%.

**Action items:**
- Prioritize untested critical paths: `syncBooks.ts`, `useSyncQueue.ts`, `importLogic.ts` edge cases, `useAuthStore.ts` flows.
- Add integration tests for the full scan → lookup → add-to-library pipeline.
- Increase branch coverage threshold to ≥ 70% (currently 50%).
- Add mutation testing (`stryker-mutator`) to validate test quality, not just quantity.

### 7. App.tsx Decomposition

**Problem:** `App.tsx` is 1000+ lines handling routing, sync orchestration, auth
init, and view rendering. This is the single biggest maintainability risk.

**Action items:**
- Extract a lightweight client-side router (or adopt a minimal library like `wouter`).
- Move sync orchestration into a dedicated `useSyncOrchestrator` hook.
- Split view-specific logic into route-level components.
- Target: App.tsx ≤ 200 lines, each extracted module independently testable.

### 8. Service Worker Update UX

**Problem:** PWA uses `autoUpdate` strategy — the service worker updates silently.
Users on stale cached versions may not get critical fixes promptly.

**Action items:**
- Switch to `prompt` update strategy with a "New version available — reload?" banner.
- Add version display in ProfileSettings (already partially there via `VITE_APP_RELEASE`).
- Log SW update events to Sentry for visibility into rollout.

### 9. Performance Budgets & Monitoring

**Action items:**
- Add Lighthouse CI to the GitHub Actions pipeline with budgets:
  - Performance ≥ 90, First Contentful Paint < 1.5s, TTI < 3s.
  - Bundle size budget: main chunk < 150KB gzipped, scanner chunk < 500KB gzipped.
- Add `web-vitals` reporting to analytics store (LCP, FID/INP, CLS).
- Monitor Tesseract WASM load time (currently cached 90 days, but first load is heavy).

### 10. Structured Logging

**Problem:** Current logging is `console.log` + Sentry breadcrumbs. No structured
log levels, no way to filter noise in production.

**Action items:**
- Introduce a thin logging utility with levels (debug, info, warn, error).
- In production: suppress debug/info, route warn/error to Sentry breadcrumbs.
- In development: all levels to console with timestamps.
- Replace scattered `console.log` calls across the codebase.

### 11. Supabase Migration Safety

**Problem:** Database migrations exist in `supabase/migrations/` but there is no
CI validation that migrations apply cleanly or that the schema matches the app's
expectations.

**Action items:**
- Add a CI step that spins up Supabase local (via `supabase start`) and runs migrations.
- Add a schema snapshot test that fails if migrations drift from expected schema.
- Document rollback procedures for each migration.

---

## P2 — Quality of Life

### 12. End-to-End Error Recovery Testing

- Simulate network failures mid-sync and verify queue integrity.
- Test `localStorage` full scenarios.
- Test expired Supabase sessions during sync.
- Add Playwright tests for offline → online transition.

### 13. Dependency Audit & Pinning

- Run `npm audit` in CI and fail on high/critical vulnerabilities.
- Pin major versions in `package.json` (currently uses `^` ranges).
- Add Renovate or Dependabot config for automated updates (Dependabot is already partially configured via `.github/` workflows).
- Audit `@zxing/browser@0.1.5` — this is a pre-1.0 library; evaluate stability.

### 14. Image / Cover Optimization

- Proxy cover images through a resizing service (Cloudflare Images, imgproxy) to
  serve appropriately-sized thumbnails instead of full-res Google Books covers.
- Add `loading="lazy"` and `decoding="async"` to cover `<img>` tags.
- Consider `<picture>` with WebP/AVIF for locally-cached covers.

### 15. Internationalization (i18n) Preparation

- Extract all user-facing strings into a messages file.
- Use `react-intl` or `i18next` for string management.
- This is a prerequisite for supporting non-English book metadata and UI.

### 16. Analytics Dashboard Completion

- Phase 25 added analytics dashboard UI (#28); verify it's wired to real data.
- Add opt-out toggle in ProfileSettings.
- Ensure no PII leaks into analytics events.

### 17. Staging Environment

- Set up a staging deployment (e.g. `staging.spinescanner.app` or a separate
  GitHub Pages branch) with `VITE_APP_ENV=staging`.
- Route staging to a separate Supabase project to avoid polluting production data.
- Use staging for QA before merging to main.

---

## Recommended Execution Order

| Sprint | Items | Effort Estimate |
|--------|-------|-----------------|
| **Sprint 1** | P0 #1 (rate limiting), #2 (CSP), #4 (a11y lint) | ~3–5 days |
| **Sprint 2** | P0 #3 (IndexedDB migration), #5 (legal review kick-off) | ~5–7 days |
| **Sprint 3** | P1 #7 (App.tsx decomposition), #6 (coverage push) | ~5–7 days |
| **Sprint 4** | P1 #8 (SW update UX), #9 (perf budgets), #10 (logging) | ~3–5 days |
| **Sprint 5** | P1 #11 (migration safety), P2 #12–13 (error recovery, deps) | ~3–5 days |
| **Ongoing** | P2 #14–17 (optimization, i18n, analytics, staging) | Incremental |

---

## Summary

The app is architecturally sound and close to production-ready. The most critical
gaps are **client-side storage durability** (localStorage → IndexedDB), **security
hardening** (CSP, rate limiting), and **accessibility**. Post-launch, the focus
should shift to **test coverage**, **App.tsx decomposition**, and **performance
monitoring** to maintain velocity as the codebase grows.
