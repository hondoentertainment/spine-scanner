# SpineScanner Launch Checklist

Use this before the first public launch and before major production changes.

## Configuration

- Set `VITE_SITE_URL` to the real production origin
- Set `VITE_BASE_PATH` to the real served path
- Set `VITE_SUPPORT_EMAIL` to a monitored address
- Set `VITE_ENABLE_SCANNER_DEBUG=false`
- Configure `VITE_SENTRY_DSN` for production
- Configure `VITE_APP_ENV=production`
- Ensure `VITE_APP_RELEASE` is injected by CI/deploy
- Confirm Supabase production keys and project are correct

## Product Trust

- Review About, Privacy, Terms, and Support pages for final wording
- Confirm support email is shown correctly in the footer and support page
- Verify canonical URL, Open Graph image, and structured data in production HTML
- Submit `sitemap.xml` to Search Console after first deploy

## Data and Recovery

- Apply all required Supabase migrations in production
- Verify database backup/restore plan exists
- Test sign-in, sync, export, and import on production config
- Confirm account recovery/password reset flow works

## Release Verification

- Run `npm run lint`
- Run `npm run test`
- Run `npm run build`
- Run `npm run test:e2e:release`
- Run `npm run test:e2e:desktop`
- Run mobile validation against the release build
- Manually test scan, photo fallback, manual ISBN, review inbox, export, and offline recovery

## Deployment

- Confirm the deploy target and canonical URL match
- Confirm monitoring is enabled before shipping
- Record the version or commit being deployed
- Assign one owner for launch verification and one for rollback

## Post-Deploy

- Verify the home page, library page, and trust pages load correctly
- Verify the service worker registers cleanly
- Verify `robots.txt` and `sitemap.xml` are reachable
- Confirm no spike in Sentry errors after deploy
- Confirm support inbox is monitored for launch week
