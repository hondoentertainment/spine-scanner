# Releasing

1. **Tag** the release (annotated tag):

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   ```

2. **Push** the tag:

   ```bash
   git push origin vX.Y.Z
   ```

3. **Notes** — Summarize changes in [CHANGELOG.md](../CHANGELOG.md) (keep `Unreleased` updated during development; move items into the version section when you cut the release).

4. **GitHub Release** (optional) — With [GitHub CLI](https://cli.github.com/):

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file path/to/notes.md
   ```

   Or paste notes from the CHANGELOG section for that version.

5. **Verify** — Before merging or tagging, confirm the root **Lint, Test & Build** workflow passes. It runs lint, `check:production`, coverage-gated Vitest, build, and Playwright release E2E from `spine-scanner/`.

6. **Launch QA** — Work through [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md). For release candidates, run `npm run test:e2e:launch` to cover desktop Chromium plus the configured mobile projects.

7. **Deploy** — Pushes to `main` can trigger both Vercel production deploys and GitHub Pages deploys, depending on which host is enabled. The root `vercel.json` runs lint, `check:production`, and build; the Pages workflow runs lint, coverage tests, build, and publishes `dist/`.

8. **MVP preview** — If you use a second Vercel project for the MVP build, set `VITE_APP_MODE` (and any other MVP-specific env vars) in that project’s Vercel environment settings so preview/production there match the MVP configuration.

9. **GitHub Pages** — Set repository variable `VITE_SUPPORT_EMAIL` under **Settings → Secrets and variables → Actions → Variables** and pass optional Supabase/Sentry secrets into [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) if Pages should include cloud sync or monitoring.
