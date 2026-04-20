# Releasing

This runbook is for production-ready releases where launch verification and rollback ownership are explicit.

## 1) Pre-release ownership and metadata

Before running checks, record:

- Release version
- Commit SHA
- Deploy target
- Canonical URL
- Launch verifier owner
- Rollback owner
- Support owner

Mirror these values in `LAUNCH_CHECKLIST.md` for launch-day tracking.

## 2) Configuration sanity check

Run the production validator with the same env values used for the build/deploy:

```bash
npm run check:production
```

Required env vars are documented in `.env.example` and validated by `scripts/check-production-readiness.mjs`.

## 3) Required release verification gates

Run the full automated gate:

```bash
npm run release:verify
```

Then run mobile matrix automation:

```bash
npm run release:verify:mobile
```

Manual real-device checks (iPhone Safari + Android Chrome) are still required. Use `e2e/MOBILE_TEST_MATRIX.md`.

## 4) Release notes and changelog

Summarize user-facing changes in [CHANGELOG.md](../CHANGELOG.md):

- Keep `## Unreleased` current during development
- Move items into the versioned section when cutting a release

## 5) Tag and push

Create and push an annotated tag:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

## 6) GitHub Release (optional)

With [GitHub CLI](https://cli.github.com/):

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file path/to/notes.md
```

Or paste notes from the matching changelog section.

## 7) Deploy targets

- **Vercel (default):** pushes to `main` trigger production deployment for the connected project.
- **MVP Vercel project (optional):** set `VITE_APP_MODE=mvp` and any MVP-specific env vars on that project.
- **GitHub Pages (manual workflow):** set repository variable `VITE_SUPPORT_EMAIL` under **Settings → Secrets and variables → Actions → Variables** if you want a real support address in the Pages build (`.github/workflows/deploy.yml`).

## 8) Post-deploy verification and rollback readiness

After deploy:

- Verify app shell pages and trust pages load
- Verify `robots.txt` and `sitemap.xml` are reachable
- Verify service worker registration is clean
- Check Sentry for regressions
- Confirm support inbox coverage

Rollback owner should keep the previous known-good commit/release immediately available.
