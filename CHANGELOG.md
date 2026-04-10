# Changelog

## Unreleased

- **CI:** GitHub Pages deploy workflow runs on `workflow_dispatch` only (production is Vercel); avoids failing automatic Pages runs on every push.
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
