# Spine Scanner — Recommended Next Steps

Prioritized improvements for the Spine Scanner project, ordered by impact and effort.

---

## Priority 1 — Blocking / High-Impact Fixes

### 1. Fix TypeScript Build Errors

The `npm run build` command fails due to type-only import violations (`verbatimModuleSyntax`) in `BookCard.tsx` and `goodreadsExport.ts`. Fix these with `import type { BookEntry }` and remove the unused `BookOpen` import from `Scanner.tsx`. This unblocks CI/CD deployment.

### 2. Add Test Coverage (Currently 0%)

No tests exist. This is the single highest-value improvement for long-term reliability.

- **Setup**: Install `vitest`, `@testing-library/react`, and `jsdom`
- **Unit tests first** — pure utility functions are easy wins:
  - `importLogic.ts` (CSV parsing, ISBN extraction)
  - `goodreadsExport.ts` (CSV generation)
  - `amazonLink.ts` (link formatting)
- **Component tests** — `BookCard`, `LibraryList`, `DataManagement` with React Testing Library
- **Hook tests** — `useBookLookup` with mocked fetch
- **Store tests** — `useBookStore` mutations
- Add a `"test"` script to `package.json` and a test step in the GitHub Actions workflow

### 3. ISBN Checksum Validation

Currently only digit length (10 or 13) is checked. Invalid ISBNs still trigger API calls.

- **ISBN-10**: Weighted sum mod 11 (with `X` as check digit)
- **ISBN-13**: Alternating 1/3 weighted sum mod 10
- Reject invalid checksums before calling Google Books API

---

## Priority 2 — Core Feature Improvements

### 4. API Resilience & Caching

The Google Books integration has no fault tolerance:

- Cache API responses in `localStorage` or a `Map` to avoid redundant lookups
- Add retry with exponential backoff for transient network failures
- Debounce/throttle rapid lookups (especially during auto-scan)
- Add Open Library API as a fallback when Google Books returns no results

### 5. Barcode Scanning

OCR on book spines is inherently unreliable. Complement the existing OCR pipeline with a dedicated barcode scanner:

- Integrate a barcode library (`zxing-js/library` or `quagga2`) for ISBN barcode detection
- Run barcode detection in parallel with OCR for faster results
- Most printed books have an ISBN-13 barcode on the back cover, which is far more reliable than OCR on spine text

### 6. Library Sorting & Filtering

The library view currently shows all books in a flat grid:

- Add sorting (title, author, date added, page count)
- Add filtering by reading status (to-read, reading, read, dnf)
- Add reading statistics summary (total books, pages, status breakdown)

### 7. JSON Export/Import for Full-Fidelity Backup

The Goodreads CSV export loses fields (notes, quotes, status). Add:

- JSON export containing the full `BookEntry` data
- JSON import with merge/overwrite strategy
- This becomes the primary backup format; CSV remains for interoperability

---

## Priority 3 — Polish & Expansion

### 8. README & Documentation

The README is still the Vite boilerplate. Replace with:

- Project description and purpose
- Screenshots or demo GIF
- Setup instructions (`npm install && npm run dev`)
- Feature overview
- Deployment guide (GitHub Pages is already configured)

### 9. Offline / PWA Support

The app already uses `localStorage` for persistence, making it a strong PWA candidate:

- Add `vite-plugin-pwa` for service worker generation and asset caching
- Queue book lookups when offline, resolve when connectivity returns
- Add install prompt for mobile home screen

### 10. Accessibility

- Add `aria-label` to all icon-only buttons (capture, debug toggle, auto-scan, manual input)
- Ensure full keyboard navigation through all views
- Add visible focus indicators beyond browser defaults
- Test with a screen reader (VoiceOver / NVDA)

### 11. Additional Export Formats

- LibraryThing TSV format
- StoryGraph CSV format
- Individual book sharing (copy link or card image)

### 12. Amazon Affiliate Tag

`amazonLink.ts` uses a placeholder tag (`tag=your-tag-20`). Either replace with a real affiliate tag or remove the parameter entirely.
