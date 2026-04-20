# Changelog

## Unreleased

- **Release ops:** Added `npm run release:verify`, `release:verify:mobile`, and `release:verify:all` scripts to run the launch verification gate in one command.
- **Docs:** Expanded `LAUNCH_CHECKLIST.md` into an owner-based launch runbook (configuration, data/recovery, deploy, and post-launch checks).
- **Docs:** Added `docs/OPERATIONS_RUNBOOK.md` with rollback procedure, support triage flow, and launch-week monitoring guidance.
- **Docs:** Expanded `docs/RELEASING.md` with explicit ownership, release gating, and post-deploy verification steps.

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
