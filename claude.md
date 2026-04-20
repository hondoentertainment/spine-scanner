# SpineScanner - Recommended Next Steps

This file is a short, execution-focused plan for what to do next.

## Priority 1: Finish launch readiness (must-do before public push)

1. Set real production env values in hosting/CI:
   - `VITE_SITE_URL`
   - `VITE_BASE_PATH`
   - `VITE_SUPPORT_EMAIL`
   - `VITE_SENTRY_DSN`
   - `VITE_APP_ENV=production`
   - `VITE_APP_RELEASE` (commit SHA/tag)
2. Fill ownership in `LAUNCH_CHECKLIST.md`:
   - launch verifier
   - rollback owner
   - support owner
3. Run the release gates:
   - `npm run check:production`
   - `npm run release:verify`
   - `npm run release:verify:mobile`
4. Complete manual real-device checklist:
   - iPhone Safari
   - Android Chrome
   - Follow `e2e/MOBILE_TEST_MATRIX.md`

## Priority 2: Close Phase 1 remaining items from `PRODUCTION_PLAN.md`

1. Final wording review for About/Privacy/Terms/Support pages.
2. Confirm canonical URL, social metadata, `robots.txt`, and `sitemap.xml` on the live domain.
3. Validate Supabase production setup:
   - apply migrations (`supabase/migrations/001-004`)
   - verify sign-in, sync, import/export, password reset
4. Run one backup/restore drill before launch.

## Priority 3: First 30 days after launch (stability loop)

1. Create Sentry views filtered by:
   - `app_release`
   - `app_env`
   - `base_path`
2. Track daily:
   - scan success vs failure trend
   - sync failure trend
   - top support issue categories
3. Use `docs/OPERATIONS_RUNBOOK.md` for:
   - rollback procedure
   - support triage flow
   - escalation triggers

## Product roadmap next implementation bets

From `NEXT_STEPS.md`, the highest-value engineering items are:

1. **Phase 25 completion**
   - Add a device benchmark runner script (`scripts/benchmark-scan.ts`) for fixture-based scan performance output.
2. **Phase 26 start**
   - Add metadata source attribution (`google_books` | `open_library` | `manual`).
   - Add metadata refresh that preserves user-edited fields.
   - Surface source/conflict indicators in book detail.

## Suggested execution order

1. Launch readiness gates and ownership.
2. Manual device validation and production sign-off.
3. Launch + monitor for 7 days.
4. Resume feature work with Phase 25 benchmark runner, then Phase 26 metadata quality layer.
