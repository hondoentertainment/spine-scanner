# SpineScanner Launch Checklist

Use this before the first public launch and before major production changes.

## 1) Launch metadata and ownership

Fill this out first so responsibility is explicit:

- Release version:
- Commit SHA:
- Deploy target (Vercel production, Pages manual, etc.):
- Canonical URL:
- Launch verifier owner:
- Rollback owner:
- Support owner:

## 2) Configuration gate

### Required environment values

- `VITE_SITE_URL` set to the real production origin
- `VITE_BASE_PATH` set to the actual served path
- `VITE_SUPPORT_EMAIL` set to a monitored inbox
- `VITE_ENABLE_SCANNER_DEBUG=false`
- `VITE_SENTRY_DSN` set for production monitoring
- `VITE_APP_ENV=production`
- `VITE_APP_RELEASE` injected by CI/deploy
- Supabase production URL/key pair is correct for this deployment

### Validation command

- Run `npm run check:production` in the same environment used for the build.

## 3) Product trust and policy pass

- Review About, Privacy, Terms, and Support pages for final wording
- Confirm support email appears in footer and Support page
- Verify canonical URL, Open Graph tags, and structured data in production HTML
- Verify `robots.txt` and `sitemap.xml` are generated and reachable
- Submit `sitemap.xml` to Search Console after first deploy

## 4) Data and recovery readiness

- Apply all required Supabase migrations in production (001-004 in `supabase/migrations/`)
- Verify automated backup/restore plan exists for production database
- Test sign-in, sync, export, and import on production config
- Confirm password reset/account recovery flow works
- Export and restore a JSON backup as a dry-run recovery drill

## 5) Release verification gate

### Required automated checks

- Run `npm run release:verify` (lint + unit tests + build + release E2E + desktop E2E)
- Run `npm run release:verify:mobile` (mobile Playwright projects)

### Required manual checks

- Run the real-device matrix in `e2e/MOBILE_TEST_MATRIX.md` (iPhone Safari + Android Chrome)
- Manually test scan, photo fallback, manual ISBN, review inbox, export, and offline recovery

## 6) Deploy and rollback readiness

- Confirm deploy target and canonical URL match
- Confirm Sentry monitoring is enabled before shipping
- Record version/commit in release notes and deploy log
- Confirm rollback owner has the prior known-good revision and rollback steps
- Confirm launch verifier and rollback owner are both online for rollout window

## 7) Post-deploy verification (first 30 minutes)

- Verify home, library, and public trust pages load correctly
- Verify service worker registration is clean (no update loop)
- Verify `robots.txt` and `sitemap.xml` return 200
- Check Sentry for error spikes/regressions vs baseline
- Confirm support inbox is monitored and responding

## 8) Post-launch operations (first 7 days)

- Track scan success rate and sync failure trends daily
- Review top support issues and update troubleshooting notes
- Capture any rollback incidents, mitigations, and follow-up tasks
