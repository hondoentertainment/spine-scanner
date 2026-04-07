# SpineScanner — Feature roadmap

**Product:** Personal book library with fast capture (barcode, OCR, manual), offline-first storage, optional cloud sync, and export-friendly data.  
**Version:** 1.1.0 (see `package.json`)  
**Last updated:** 2026-03-11  

---

## 1. Positioning vs. common alternatives

| Competitor / pattern | Their strength | SpineScanner angle |
|---------------------|----------------|-------------------|
| **Goodreads** | Social + discovery | **Privacy & ownership** — your data, optional account |
| **Libib / Libib-style** | Simple catalog + loans | **Faster capture** — live scan + OCR spine |
| **LibraryThing** | Power metadata | **Lower friction** — mobile-first, PWA |
| **BookBuddy / Bookshelf apps** | Native polish | **Web + offline** — no store gate, works everywhere |
| **StoryGraph** | Reading analytics | **Inventory-first** (analytics can layer on later) |

Roadmap items below are prioritized to keep **capture speed**, **data portability**, and **mobile UX** ahead of feature bloat.

---

## 2. Release tiers

### Tier A — **Shipped (v1.x baseline)** ✅

Verified in codebase (routes, stores, components).

| Feature | Evidence / notes |
|--------|-------------------|
| Multi-route app shell | `App.tsx` — `/scan`, `/library`, `/data`, `/profile`, public pages |
| Barcode scanning | `Scanner.tsx`, `useBarcodeScanner.ts`, ZXing |
| OCR / pipeline | `useScanPipeline.ts`, `useOcrEngine.ts`, Tesseract assets |
| Manual ISBN + validation | Scanner UI, `isbnValidation.ts` |
| Photo-only book entry | `BookEntry.isPhotoOnly`, capture flow |
| Library: grid/list, sort, filter | `LibraryList.tsx`, preferences in `types.ts` |
| Shelves + smart shelves + saved views | `ShelfManager.tsx`, `ProfilePreferences` |
| Book detail, status, notes, progress fields | `BookDetail.tsx`, `BookEntry` |
| Duplicate handling | Store + confirm flow in `App.tsx` |
| Batch add mode | Preferences + scanner UX |
| Supabase auth | `useAuthStore.ts`, `AuthPanel.tsx` |
| Cloud sync + queue | `syncBooks.ts`, `useSyncQueue.ts` |
| Import / export | `DataManagement.tsx` |
| Profile + theme (light/dark/system) | `ProfileSettings.tsx`, `useTheme.ts` |
| Onboarding | `OnboardingModal.tsx` |
| PWA + icons | `vite` PWA plugin, `manifest`, SW |
| Public trust pages | `PublicInfoPage.tsx` |
| Error monitoring hook | `errorMonitoring.ts` (Sentry-capable) |
| Share / deep link to book | `shareBook.ts` → `/library?isbn=` |
| Tests (unit/component) | `**/__tests__/**`, hooks tests |

---

### Tier B — **Next (0–3 months)** — close competitive gaps

| ID | Feature | Rationale | Complexity |
|----|---------|-----------|------------|
| B1 | **Global search polish** — recent queries, highlight matches, empty-state CTAs | Matches Libib/Bookshelf “find fast” expectation | Medium |
| B2 | **Reading goals / streaks (light)** — yearly book count, optional goal | Common in top reading apps; keep opt-in | Medium |
| B3 | **Cover art fallback grid** — placeholder illustration when no thumbnail | Visual parity with storefront UIs | Low |
| B4 | **Loan / borrow tracking** | Table stakes for home-library apps (Libib) | Medium |
| B5 | **Barcode bulk session summary** — “You added N books” with undo window | Reinforces batch workflow | Low |
| B6 | **iOS/Android “Add to Home Screen” hints** — contextual banner once | PWA discoverability | Low |
| B7 | **Export formats** — CSV + JSON already; add **Goodreads-compatible CSV** if feasible | Migration / trust | Medium |
| B8 | **Accessibility sweep** — WCAG 2.2 AA on Library + Scanner | Enterprise / education users | Medium |

#### Recently shipped toward Tier B (implementation wave)

- **B2 (partial):** `finishedThisYear` in `getLibraryInsights` + hero card + stats row (`bookPresentation.ts`, `LibraryList.tsx`).
- **B1 (partial):** Filter chips are **removable** (tap × / chip) + **`aria-live`** result count for screen readers.
- **B6 (partial):** Dynamic **`theme-color`** + iOS **`apple-mobile-web-app-status-bar-style`** from resolved theme (`useTheme.ts`, `index.html` ids).
- **Cover consistency:** `BookDetail` uses `getBookCoverSrc` like `BookCard` / `LibraryList`.
- **Mobile library:** Horizontal **scroll shelf/status filters**; **stacked bulk bar** on narrow viewports (`LibraryList.module.css`).
- **Shelf pickers:** Outside-click + **Escape** + focus return (`BookCard`, `BookDetail`); card **Space** activates open.
- **Design tokens:** Shared **`--error`** palette + scan alert uses tokens (`index.css`, `App.module.css`).

---

### Tier C — **Mid-term (3–9 months)** — differentiation

| ID | Feature | Rationale | Complexity |
|----|---------|-----------|------------|
| C1 | **Series / volume grouping** | Metadata richness vs. LibraryThing-lite | High |
| C2 | **Optional Open Library / Google Books enrichment** (user-triggered) | Better covers & series without lock-in | High |
| C3 | **Widgets / share card** — OG image per book or shelf | Social sharing without building a network | Medium |
| C4 | **Full-text notes search** | Power user retention | Medium |
| C5 | **Multi-profile / household** — separate libraries under one login | Family use case | High |
| C6 | **Backup automation** — scheduled export reminder | Data ownership story | Low |

---

### Tier D — **Exploratory (9+ months)** — only if core metrics strong

| ID | Feature | Notes |
|----|---------|--------|
| D1 | Private friend share / shelf URL | Avoid Goodreads-scale moderation |
| D2 | Reading stats & charts (StoryGraph-style) | Heavy UX + data model |
| D3 | Native wrappers (Capacitor) | If PWA limits camera/sync |

---

## 3. Engineering enablers (cross-cutting)

| Enabler | Why |
|---------|-----|
| E2E coverage for scan → library → export | Protects core differentiator |
| Performance budget (Lighthouse / INP) | Mobile capture must stay &lt;200ms perceived |
| Design tokens single source | See `DESIGN_AESTHETIC_EVALUATION.md` + `index.css` |
| Feature flags (env or remote) | Safe rollout of B2/C2 |

---

## 4. Success metrics (suggested)

| Metric | Target idea |
|--------|-------------|
| Time to add first book (new user) | &lt; 60s median |
| Scan success rate | Track barcode vs OCR vs manual fallback |
| Weekly retained library actions | Open app + 1 edit or add |
| Export usage | % users who export (trust signal) |
| Sync error rate | &lt; 1% of sessions |

---

## 5. How to use this doc

- **Planning:** Pick items from Tier B for the next milestone; keep Tier C gated on retention.  
- **PRs:** Reference roadmap IDs in commit messages or PR descriptions.  
- **Review:** Pair with `docs/DESIGN_AESTHETIC_EVALUATION.md` when shipping UI-heavy features.
