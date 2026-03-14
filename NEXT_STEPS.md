# Spine Scanner - Next Steps

Status of recommended improvements. Items marked completed are implemented.

---

## Completed

| # | Item | Status |
|---|------|--------|
| 1 | TypeScript build errors | Completed |
| 2 | Test coverage | Completed - 266 unit tests, Playwright E2E, mobile matrix |
| 3 | ISBN checksum validation | Completed - `isbnValidation.ts` |
| 4 | API resilience & caching | Completed - Retry, cache, debounce, Open Library fallback |
| 5 | Barcode scanning | Completed - ZXing + OCR pipeline |
| 6 | Library sorting & filtering | Completed - Sort, status filter, shelves, stats |
| 7 | JSON export/import | Completed - Full backup/restore |
| 8 | README & docs | Completed |
| 9 | Offline / PWA support | Completed - `vite-plugin-pwa`, service worker |
| 10 | Test step in deploy workflow | Completed - `npm run test` before build |
| 11 | Duplicate scan "Update notes" | Completed - Confirm dialog -> Open in library |
| 12 | PWA icons (192, 512) | Completed - Generated from SVG |
| 13 | LibraryThing TSV, StoryGraph CSV | Completed - Export formats |
| 14 | Accessibility: aria-labels, focus ring | Completed - Icon buttons, nav, shelf chips |
| 15 | Amazon affiliate tag | Completed - `VITE_AMAZON_AFFILIATE_TAG` in `.env` |
| 16 | Individual book sharing | Completed - Share button, Web Share API, copy link, deep links `#book-ISBN` |
| 17 | Camera torch | Completed - Flashlight toggle for low light (mobile) |
| 18 | Scanner UX | Completed - Haptics, faster auto-scan, OCR pre-warm |
| 19 | Version 1.0.0 | Completed - `package.json` version bumped |
| 20 | Vitest coverage | Completed - `@vitest/coverage-v8`, `npm run test:coverage`, CI reports |
| 21 | Accessibility: skip link, focus trap, reduced motion | Completed - Skip link, modal focus trap, reduced motion, SR announcements |
| 22 | Grid view virtualization | Completed - `@tanstack/react-virtual` for 1000+ book libraries |
| 23 | Client-side usage analytics | Completed - `useAnalyticsStore` with aggregated summary |
| 24 | Error monitoring (Sentry) | Completed - Optional env-gated `@sentry/react` integration |

---

## Roadmap: Next 10 Phases

| # | Phase | Goal | Key deliverables |
|---|-------|------|------------------|
| 25 | Scan Accuracy Hardening | Reduce failed scans and shorten time-to-add on real devices | Device-based scanner benchmark set, confidence scoring in pipeline, low-light / glare presets, OCR diagnostics surfaced in UI, regression suite for difficult covers and barcodes |
| 26 | Metadata Quality Layer | Make imported book data more trustworthy and editable in bulk | Metadata source attribution, conflict resolution when Google/Open Library disagree, edition-aware matching, bulk metadata refresh, missing-cover recovery flow |
| 27 | Reading Workflow Expansion | Turn the library into an active reading tracker instead of just a catalog | Reading sessions, progress percent / pages finished, start-finish dates, quick status actions, reading streak / yearly goals, richer stats cards |
| 28 | Collections and Smart Shelves | Help users organize large libraries without manual tagging overhead | Rule-based shelves, saved searches, shelf templates, sort presets, multi-select bulk actions, archive / hidden shelf support |
| 29 | Social and Household Sharing | Support shared libraries across families, clubs, or small teams | Household mode, lend/borrow tracking, shared shelves, permissions for viewers vs editors, activity feed for collaborative changes |
| 30 | Cloud Sync V2 | Make sync safer, clearer, and more resilient across devices | Sync history panel, conflict UI, offline queue inspector, background retry strategy, last-good snapshot restore, migration tooling for schema changes |
| 31 | Insights and Recommendations | Surface useful patterns from the user's own library behavior | Personalized recommendations from owned books, unread backlog insights, duplicate / edition detection, series completion hints, exportable reading reports |
| 32 | Accessibility and Inclusive UX | Reach a production-ready accessibility bar across devices | Real-device VoiceOver / NVDA audits, larger touch-target pass, high-contrast mode, motion controls, keyboard-only scanner alternatives, accessibility CI checks |
| 33 | Platform Integrations | Connect Spine Scanner to the rest of a reader's ecosystem | Native importers for Goodreads / StoryGraph history, calendar export for reading goals, Notion / CSV automation endpoints, optional webhook events, richer share targets |
| 34 | Release Readiness and Growth | Prepare the app for broader public launch and ongoing maintenance | In-app onboarding, feature flags, changelog / release notes view, support diagnostics bundle, privacy controls, admin telemetry dashboard, deployment / rollback playbooks |

---

## Notes by Phase

### Phase 25 - Scan Accuracy Hardening
- Prioritize the top 20 scan failure patterns from real device testing before adding new scan modes.
- Add fixtures for glossy covers, partial barcodes, rotated spines, and dim-light captures.
- Define a measurable target such as scan success rate and median time-to-add.

### Phase 26 - Metadata Quality Layer
- Keep manual edits first-class so metadata refreshes never overwrite user-authored fields silently.
- Store source and confidence per field where practical.
- Treat cover image repair as part of metadata quality, not just visual polish.

### Phase 27 - Reading Workflow Expansion
- Build around lightweight interactions so the app stays fast during scanning sessions.
- Prefer one-tap progress logging and status updates from the library view.
- Let stats remain useful offline.

### Phase 28 - Collections and Smart Shelves
- Start with saved filters built on current shelf/status/search logic.
- Add bulk edit flows only after selection UX is solid on mobile.
- Keep manual shelves and smart shelves visually distinct.

### Phase 29 - Social and Household Sharing
- Begin with simple trusted sharing before broader public discovery features.
- Model ownership clearly so edits and deletes remain reversible.
- Include book lending reminders as a small but high-value early feature.

### Phase 30 - Cloud Sync V2
- Ship visibility before complexity: users should understand pending changes and conflicts.
- Add recovery tooling before pushing more aggressive background sync behavior.
- Test multi-device edits explicitly in CI and manual QA.

### Phase 31 - Insights and Recommendations
- Use only library-owned and user-entered data by default.
- Keep recommendation logic explainable: show why a title or trend is being surfaced.
- Exportable summaries can double as shareable year-in-books reports.

### Phase 32 - Accessibility and Inclusive UX
- Treat scanner accessibility as more than labels: guidance, alternatives, and feedback all matter.
- Add real assistive tech validation to the release checklist.
- Consider dyslexia-friendly typography and clearer error wording where it helps.

### Phase 33 - Platform Integrations
- Focus on integrations users already rely on for book tracking first.
- Keep external integrations optional and easy to revoke.
- Use stable import/export contracts before adding automation hooks.

### Phase 34 - Release Readiness and Growth
- Feature flags should gate unfinished capabilities without branching the UX too heavily.
- Support tooling should help debug sync, scan, and metadata issues quickly.
- Pair launch work with a maintenance plan so reliability keeps up with adoption.

---

## Still Worth Doing Alongside the Roadmap

- See `PRODUCTION_PLAN.md` for the launch-focused phased plan.
- See `LAUNCH_CHECKLIST.md` for the release-day checklist.

### Accessibility
- Screen reader testing (VoiceOver / NVDA) on real devices

### Optional polish
- Individual book sharing: card image export
- Analytics dashboard UI panel (data is tracked; display panel is still future)

---

## Archived

This doc previously listed many items as recommended next steps. Those have been implemented. The phases above extend the roadmap beyond the completed core app work.
