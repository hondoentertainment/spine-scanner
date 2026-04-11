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

5. **Deploy** — Pushes to `main` trigger Vercel production deploys for the connected project (no manual deploy step required for the default setup).

6. **MVP preview** — If you use a second Vercel project for the MVP build, set `VITE_APP_MODE` (and any other MVP-specific env vars) in that project’s Vercel environment settings so preview/production there match the MVP configuration.

7. **GitHub Pages (manual workflow)** — Set repository variable `VITE_SUPPORT_EMAIL` under **Settings → Secrets and variables → Actions → Variables** if you want a real address in the Pages build (see `.github/workflows/deploy.yml`).
