# Recommended Next Steps

An opinionated prioritization of what to tackle next, based on a full review of the codebase, roadmap, test coverage, mobile audit, and architecture.

---

## Highest Impact — Do First

### 1. Finish the Mobile UX Audit Items

The mobile audit (MOBILE_UX_AUDIT.md) has several unchecked items that are low-effort, high-value fixes for the primary use case (scanning books on a phone):

- **Touch targets**: Add `min-height: 44px; min-width: 44px` to `.navBtn` and other interactive elements. This is an accessibility requirement, not polish.
- **`touch-action: manipulation`**: Apply to buttons and links to eliminate the 300ms tap delay on mobile browsers that still honor it.
- **Bottom nav on mobile**: The top nav is harder to reach one-handed on tall phones. A bottom nav bar for the three primary tabs (Scanner / Library / Profile) on viewports under 640px would meaningfully improve ergonomics.

**Why first**: These are small, targeted CSS/layout changes that improve the experience for every mobile user right now, with no architectural risk.

### 2. Phase 25 — Scan Accuracy Hardening

Scanning is the core differentiator. Improving it has outsized impact:

- **Build a benchmark fixture set**: Collect 20-30 real-world failure cases (glossy covers, partial barcodes, rotated spines, dim lighting) and add them as test fixtures.
- **Define measurable targets**: e.g., 85% scan success rate, median time-to-add under 8 seconds.
- **Surface OCR diagnostics in the UI**: The `ocrDiagnostics.ts` utility already exists — expose confidence scores and failure reasons so users understand what went wrong.
- **Low-light / glare presets**: Leverage the existing `imageProcessing.ts` pipeline to add adaptive preprocessing based on lighting conditions.

**Why second**: Every percentage point of scan accuracy directly reduces user friction. The infrastructure (OCR diagnostics, image processing) is already in place.

### 3. Phase 26 — Metadata Quality Layer

After scanning works reliably, the next pain point is metadata accuracy:

- **Source attribution**: Show users where each field came from (Google Books vs Open Library vs manual edit).
- **Conflict resolution UI**: When sources disagree on author name or page count, let the user pick.
- **Protect manual edits**: Never overwrite user-authored fields during a metadata refresh.
- **Missing cover recovery**: Add a flow to search for and attach cover images to books that came in without one.

**Why third**: Bad metadata erodes trust in the library. This phase makes the data layer reliable before building features (reading tracking, smart shelves) on top of it.

---

## Medium Priority — Do Next

### 4. Phase 27 — Reading Workflow Expansion

This transforms the app from a catalog into a daily-use tool:

- Reading sessions with page/percent progress
- Start and finish dates
- Quick status actions from the library view (one-tap "started reading", "finished")
- Reading streaks and yearly goals

Keep interactions lightweight — the app should stay fast during scanning sessions. Build stats to work offline.

### 5. Analytics Dashboard UI

The analytics store (`useAnalyticsStore`) is already collecting aggregated data, but there's no UI to display it. A simple dashboard showing scan counts, books added over time, and reading activity would give users a reason to return to the app between scanning sessions.

### 6. Phase 28 — Collections and Smart Shelves

Start with saved filters built on the existing shelf/status/search logic. Add rule-based smart shelves (e.g., "Unread fiction over 300 pages"). Defer bulk edit flows until selection UX is solid on mobile.

---

## Lower Priority — Plan For Later

### 7. Phase 32 — Accessibility Audit with Real Assistive Tech

The app already has good foundational accessibility (ARIA labels, focus trap, skip link, reduced motion). The next step requires real-device testing with VoiceOver and NVDA, which is harder to automate. Schedule this before any public launch push.

### 8. Phase 29 — Social and Household Sharing

High user value but high complexity. Requires careful permission modeling in Supabase. Start with simple household sharing (trusted users, shared shelves) before broader social features. The lending/borrowing tracker is a small, high-value entry point.

### 9. Phase 30 — Cloud Sync V2

The current sync works. V2 improvements (conflict UI, offline queue inspector, sync history) are important for reliability at scale but can wait until the user base grows enough to generate real multi-device conflict scenarios.

### 10. Phases 31, 33, 34 — Insights, Integrations, Launch Prep

These are growth-phase features. Tackle them once the core experience (scan, organize, read, sync) is polished and validated with real users.

---

## Housekeeping Worth Doing Anytime

| Item | Effort | Notes |
|------|--------|-------|
| Delete stale error files (`ts_errors.txt`, `tsc_errors.txt`, `build_output.txt`) | 5 min | These contain outdated TypeScript errors and add noise |
| Add a `CLAUDE.md` | 30 min | Project conventions, test commands, architecture notes — helps AI tooling and new contributors |
| Raise test coverage above 70% | Ongoing | Current baseline is 63% statements. Focus coverage on `useScanPipeline.ts` (47KB, core orchestration) and `imageProcessing.ts` (27KB) |
| Skeleton loaders for lazy views | 1-2 hr | Replace "Loading scanner..." text with skeleton placeholders |

---

## Summary

```
Priority  Phase  Focus
────────  ─────  ─────────────────────────────
  NOW       —    Mobile UX audit fixes
  NOW      25    Scan accuracy hardening
  NEXT     26    Metadata quality layer
  SOON     27    Reading workflow
  SOON      —    Analytics dashboard UI
  SOON     28    Smart shelves
  LATER    32    Real assistive-tech audit
  LATER    29    Social / household sharing
  LATER    30    Cloud sync V2
  LATER  31-34   Insights, integrations, launch
```

The guiding principle: **make scanning and organizing books excellent before adding social, insights, or platform features**. Each step builds confidence in the layer below it.
