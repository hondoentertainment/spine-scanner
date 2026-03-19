# Production Hardening Recommendations

This document outlines prioritized next steps to harden and productionize SpineScanner.
Current readiness estimate: **~75%** — solid for beta/early adopters, gaps remain for general availability.

---

## Priority 1 — Critical (before GA launch)

### 1.1 Content Security Policy
Add a strict CSP header to prevent XSS escalation. The app has no `Content-Security-Policy` header today.

**In `vercel.json`:**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://*.supabase.co https://www.googleapis.com https://openlibrary.org https://*.sentry.io; img-src 'self' data: https://covers.openlibrary.org https://books.google.com; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:;"
        }
      ]
    }
  ]
}
```

Note: `wasm-unsafe-eval` is required for Tesseract.js. `unsafe-inline` for styles may be tightened with nonces once Vite supports it.

---

### 1.2 Rate Limiting on External API Calls
Google Books and Open Library enforce undocumented rate limits. Sustained scanning can trigger 429s with no user feedback.

**Changes needed in `src/hooks/useBookLookup.ts`:**
- Track request timestamps in a sliding window (e.g., max 10 req/10s)
- Surface `429` errors with a user-facing toast: "Slow down — metadata lookup rate limited, retrying in Xs"
- Apply backoff from the `Retry-After` response header when present

---

### 1.3 Storage Quota Guard
`localStorage` is limited (~5–10 MB). Large libraries with cover URLs can approach limits silently.

**Add to `src/store/useBookStore.ts`:**
```ts
async function checkStorageQuota() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { usage, quota } = await navigator.storage.estimate();
    if (usage / quota > 0.85) {
      // warn user via toast
    }
  }
}
```
Call on store hydration and after each book add.

---

### 1.4 Sync Conflict Resolution
Multi-device sync has no conflict resolution. Last-write-wins silently overwrites changes.

**Minimum viable approach:**
- Add `updated_at` timestamp to every book row in Supabase (already exists as `updatedAt` in `BookEntry`)
- During sync pull, compare local `updatedAt` vs remote — if both changed since last sync, surface a per-book conflict UI
- Add a `last_synced_at` field to track baseline

---

### 1.5 Offline Sync Queue Visibility
`useSyncQueue` tracks failures but the user has no visibility unless they open settings.

**Add a persistent banner** (e.g., `SyncStatusBanner`) that shows:
- "X changes pending sync" with a manual "Sync now" button
- Red indicator when sync has been failing for >5 min
- Last successful sync timestamp

---

## Priority 2 — High (within first month of GA)

### 2.1 Accessibility Audit
Current state: focus traps exist (`useFocusTrap`), but no validation with assistive tech.

**Action items:**
- Run axe-core audit via `@axe-core/react` in development
- Add E2E a11y assertions: `npm install --save-dev @axe-core/playwright`
- Add `aria-label` to all icon-only buttons (scanner controls, shelf actions)
- Validate with VoiceOver (iOS Safari) and TalkBack (Android Chrome) on real devices
- Add `prefers-reduced-motion` support to scanning animations

---

### 2.2 Increase Test Coverage — Sync & Offline Flows
Current E2E tests cover smoke only. No tests for:
- Adding a book offline → coming online → verifying sync
- Supabase auth flow (login, signup, session restore)
- Conflict/merge scenarios
- Large library import (>1,000 books)

**Add Playwright tests** for these flows using Supabase local dev (`supabase start`).

---

### 2.3 Error Monitoring — Make Sentry Non-Optional
Sentry is currently optional. In production, uncaught errors are invisible without it.

**Steps:**
- Create a free Sentry project and add `VITE_SENTRY_DSN` to Vercel/GitHub Pages env
- Add Sentry to CI deploy check: fail deploy if DSN is missing in prod env
- Set `tracesSampleRate` to `0.05` in production (reduce from `0.1` to lower cost)
- Add a Sentry alert rule for error spike (>10 new errors/hour)

---

### 2.4 Performance — Virtual Scrolling for Large Libraries
The library grid renders all books at once. At 500+ books, scroll performance degrades.

**Use `@tanstack/react-virtual`:**
```ts
import { useVirtualizer } from '@tanstack/react-virtual';
```
Apply to `LibraryList` component's grid. This is critical for users importing from Goodreads (can have 1,000+ books).

---

### 2.5 Image Optimization
Cover images are fetched at full resolution (~50–200KB each) with no optimization.

**Options (pick one):**
- Use Open Library's thumbnail size (`?default=false&id=isbn&type=isbn&size=S`) instead of medium
- Add a Cloudflare Image Transform proxy (if using Cloudflare)
- Use `loading="lazy"` on all `<img>` tags (check if already set)
- Consider caching covers in IndexedDB (larger quota than localStorage) for offline access

---

### 2.6 Supabase Setup Automation
New self-hosters must manually run SQL to set up RLS policies. This is error-prone and undocumented.

**Create `supabase/migrations/` directory** with:
- `001_create_books.sql` — table schema
- `002_rls_policies.sql` — RLS rules
- `003_indexes.sql` — performance indexes

Then document with `supabase db push` in README.

---

## Priority 3 — Medium (first quarter)

### 3.1 Feature Flags
Enable gradual rollouts and A/B testing without deployments.

**Lightweight approach (no external service):**
```ts
// src/utils/featureFlags.ts
const FLAGS = {
  virtualScrolling: import.meta.env.VITE_FLAG_VIRTUAL_SCROLL === 'true',
  cloudBackup: import.meta.env.VITE_FLAG_CLOUD_BACKUP !== 'false', // on by default
};
```

Or integrate [Unleash](https://www.getunleash.io/) / [PostHog feature flags](https://posthog.com/docs/feature-flags) for runtime control without redeployment.

---

### 3.2 In-App Onboarding
New users with no books see a blank library with no guidance.

**Add an empty state flow:**
1. Welcome screen with 3-step tour (scan, organize, sync)
2. Sample book pre-loaded with "This is a demo — scan your first book!"
3. Tooltip overlay on first scanner open explaining the crosshair
4. Persist `hasCompletedOnboarding` flag in profile store

---

### 3.3 Load / Scale Testing
**Open questions with no answers today:**
- How does the app perform with 10,000 books in localStorage?
- How long does a full sync take with 5,000 books on slow 3G?
- What happens to Tesseract when the device gets warm (thermal throttle)?

**Actions:**
- Add a `scripts/generate-large-library.mjs` fixture (10k books) for manual load testing
- Add a Playwright perf test measuring scroll FPS with 1,000 books
- Profile Tesseract on low-end Android via Chrome DevTools remote debug

---

### 3.4 Soft Delete & Undo
Books deleted by mistake cannot be recovered.

**Add to Supabase schema:**
```sql
ALTER TABLE books ADD COLUMN deleted_at timestamptz DEFAULT NULL;
```

**Add to UI:**
- Toast with "Undo" button (10s window) after deletion
- Trash view in settings for recovering soft-deleted books
- Purge deleted books older than 30 days via Supabase scheduled function

---

### 3.5 Supabase Connection Resilience
Supabase realtime drops are not retried explicitly.

**Add to `src/lib/syncBooks.ts`:**
- Detect `CHANNEL_ERROR` from Supabase realtime
- Implement exponential backoff reconnect (1s, 2s, 4s, max 30s)
- Track reconnect state in `useSyncQueue` to show "Reconnecting..." in sync banner

---

### 3.6 Rollback Strategy
Current deploy is a single GitHub Pages push with no rollback.

**Add:**
- Tag each release: `git tag v1.x.x` before deploy
- Store previous build artifact in GitHub Actions cache
- Add a `workflow_dispatch` rollback job that re-deploys a tagged artifact
- Document rollback steps in `CONTRIBUTING.md`

---

## Priority 4 — Low / Nice-to-Have

| Item | Description |
|------|-------------|
| High-contrast mode | Honor `prefers-contrast: more` in theme system |
| Real-device OCR tests | Add physical device to CI via BrowserStack Automate |
| Privacy policy | Required before app store submission or if collecting any analytics |
| Keyboard scanning alternative | For users who cannot use camera (e.g., manual ISBN entry with barcode keyboard input) |
| PWA install prompt | Surface browser install prompt at right moment (after 2nd scan) |
| Export to Apple Books / Kindle | Integration export formats beyond Goodreads/LibraryThing |
| Session replay | Add PostHog or LogRocket for debugging user-reported issues |
| HTTP/2 push hints | Pre-push Tesseract WASM on page load for faster first scan |

---

## Quick Wins (< 1 day each)

These require minimal effort and should be done immediately:

1. **Add `<meta name="theme-color">`** to `index.html` for mobile browser chrome coloring
2. **Add `loading="lazy"` to all book cover `<img>` tags** — reduces initial load time
3. **Set `navigator.storage.persist()`** on first run to prevent browser from evicting localStorage
4. **Add `robots.txt`** to `public/` to control crawler access
5. **Document required env vars** in `README.md` with links to where to get them (Supabase dashboard, Sentry)
6. **Add `SECURITY.md`** with responsible disclosure process
7. **Enable Dependabot security alerts** (separate from the existing version-update Dependabot)
8. **Add `X-Content-Type-Options: nosniff`** and `X-Frame-Options: DENY` headers in `vercel.json`

---

## Summary by Theme

| Theme | Current State | Gap | Effort |
|-------|--------------|-----|--------|
| Security headers | Partial (cache headers only) | CSP, X-Frame-Options missing | Low |
| Error monitoring | Optional / often off | Should be mandatory in prod | Low |
| Sync resilience | Optimistic, no UI | Conflict resolution, queue visibility | High |
| Accessibility | Partial (focus traps) | A11y audit + AT validation | Medium |
| Performance at scale | Untested | Virtual scroll, quota guard | Medium |
| Rollback / deploys | Single push | Tag + rollback workflow | Low |
| Onboarding | None | Empty state + tour | Medium |
| Test coverage | 66% unit, smoke E2E | Sync + offline E2E tests | High |
