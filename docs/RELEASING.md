# Releasing

## Branch protection (`main`)

- **Required check:** **Lint, Test & Build** must pass before merge (GitHub → **Settings → Branches → Branch protection rule** for `main`).
- **Enforce for administrators** — Keep this **enabled** so admins cannot bypass failing checks (same screen → *Do not allow bypassing the above settings*).

### What PR CI tests run

**Lint, Test & Build** runs Vitest with **`scanRegressionFixtures.test.ts` excluded** so the job finishes within runner limits. Heavy OCR regression still runs in **OCR integration tests** (weekly workflow, job 2) and locally via `npm test` or `npm run test:integration`.

## Vercel environment checklist (production)

Confirm in the Vercel project (**Settings → Environment Variables**) for **Production** (and Preview if needed):

| Variable | Notes |
|----------|--------|
| `VITE_SITE_URL` | Canonical origin, no trailing slash |
| `VITE_BASE_PATH` | Usually `/` on Vercel root deploy; match your URL shape |
| `VITE_SUPPORT_EMAIL` | Shown in Profile / legal pages |
| `VITE_SENTRY_DSN` | Optional; omit for no-op monitoring |
| `VITE_APP_RELEASE` | e.g. `VERCEL_GIT_COMMIT_SHA` or leave unset for fallback |
| `VITE_APP_ENV` | `production` / `preview` as appropriate |
| `VITE_APP_MODE` | **Omit** for full app; set `mvp` only on a dedicated MVP deployment |
| Supabase | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` together or both unset |

See [`.env.example`](../.env.example) for descriptions of all `VITE_*` keys.

---

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

5. **Deploy** — Pushes to `main` trigger Vercel production deploys for the connected project (no manual deploy step required for the default setup).

6. **MVP preview** — If you use a second Vercel project for the MVP build, set `VITE_APP_MODE` (and any other MVP-specific env vars) in that project’s Vercel environment settings so preview/production there match the MVP configuration.

7. **GitHub Pages (manual workflow)** — Set repository variable `VITE_SUPPORT_EMAIL` under **Settings → Secrets and variables → Actions → Variables** if you want a real address in the Pages build (see `.github/workflows/deploy.yml`).
