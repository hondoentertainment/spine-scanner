# Launch Checklist

Use this before a public launch or production promotion.

## Automated Gates

- Root CI workflow passes: lint, `check:production`, coverage-gated Vitest, build, and Playwright release E2E.
- Weekly or release-candidate OCR integration passes via the root `ocr-integration.yml` workflow.
- Run `npm run test:e2e:launch` locally or in a release-candidate workflow for Chromium plus mobile Chrome/Safari smoke coverage.
- Run `npm run test:e2e:ocr` or the OCR integration workflow for OCR-heavy fixture coverage.

## Environment And Deploy

- `VITE_SITE_URL` matches the target host and has no trailing slash.
- `VITE_BASE_PATH` matches the host: `/` on Vercel, `/<repo>/` on GitHub Pages.
- `VITE_SUPPORT_EMAIL`, `VITE_APP_ENV`, `VITE_APP_RELEASE`, and `VITE_ENABLE_SCANNER_DEBUG=false` are set.
- `VITE_SENTRY_DSN` is set for monitored production builds, and Sentry events show the expected release/environment.
- Supabase auth/sync env vars are set only on deployments where cloud sync is intended.
- Supabase RLS policies are verified for `profiles`, `books`, and `shelves`.

## Manual QA

- Scanner: barcode success, OCR fallback, manual ISBN entry, batch mode, duplicate warning, and photo-only entry.
- Metadata: provider disagreement marks review, alternate ISBN edition lookup works, missing-cover recovery fills a cover when another provider has one, and bulk refresh preserves user-edited fields.
- Library: search, filters, saved views, smart shelves, duplicate merge, bulk status, bulk shelf assignment, bulk metadata refresh, and review resolution.
- Data: JSON export/import round trip, Goodreads/LibraryThing/StoryGraph export, destructive delete confirmation, and web import failure messaging.
- Auth/sync: sign up, sign in, password reset, offline edits, reconnect sync, failed sync retry, sign out, and local-only mode with Supabase disabled.
- PWA/offline: install prompt, refresh after service worker update, app reload while offline, and cached scanner assets.
- Accessibility: keyboard-only navigation, focus trap in modals, visible focus states, toast announcements, scanner live regions, and VoiceOver/NVDA smoke pass.
- Mobile: iPhone Safari, Android Chrome, camera permission prompts, touch targets, viewport resize, and scroll behavior.

## Rollback And Support

- Keep the previous successful deployment URL available for rollback.
- Confirm support diagnostics include release, environment, base path, online state, sync status, monitoring state, book/shelf counts, and current route.
- Confirm privacy/support pages describe camera use, local storage, optional cloud sync, third-party metadata lookups, and monitoring.
