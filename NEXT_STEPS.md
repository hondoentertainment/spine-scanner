# Spine Scanner - Recommended Next Steps

Prioritized roadmap based on current project state. Items are ordered by impact and urgency.

---

## Priority 1: Foundation (do these first)

### 1. Add Testing Infrastructure

The project has **zero test coverage**, which makes every change risky.

- **Setup**: Add Vitest + `@testing-library/react` + `jsdom` (pairs naturally with Vite)
- **Unit tests first**: Pure utility functions are easy wins — `importLogic.ts` (CSV parsing, ISBN extraction), `goodreadsExport.ts`, `amazonLink.ts`
- **Component tests**: `BookCard`, `LibraryList`, `DataManagement` with React Testing Library
- **Integration test**: Google Books API lookup flow (`useBookLookup`) with mocked fetch
- **CI gate**: Add a test step to `.github/workflows/deploy.yml` before the build step

### 2. ISBN Validation

Currently only checks string length (10 or 13 digits). Invalid ISBNs waste API calls and confuse users.

- **ISBN-10**: Weighted sum mod 11 checksum
- **ISBN-13**: Alternating 1/3 weighted sum mod 10 checksum
- Reject invalid checksums before calling Google Books API
- Show clear error message to the user on invalid input
- This is a small, self-contained change that pairs well with writing tests

### 3. Error Handling & Resilience

Several failure modes are unhandled:

- **API errors**: Google Books lookups have no retry logic, rate limiting, or meaningful error messages
- **No error boundaries**: A component crash takes down the whole app
- **Request debouncing**: Rapid duplicate lookups can fire simultaneously
- Add a fallback data source (Open Library API) when Google Books returns no results
- Cache API responses in localStorage to avoid redundant network calls

---

## Priority 2: User Experience Improvements

### 4. Library Organization

The library view is flat with search only — common tasks like filtering are missing:

- Sort by title, author, date added, or page count
- Filter by reading status (to-read, reading, read, dnf)
- Reading statistics dashboard (total books, pages read, status breakdown)
- Tagging/shelving system for custom categorization

### 5. Improved OCR Accuracy

The OCR pipeline uses basic grayscale + contrast preprocessing:

- Add image sharpening and adaptive threshold binarization before OCR
- Crop to the viewfinder region instead of processing the full camera frame
- Consider adding a barcode scanning library (`quagga2` or `zxing-js`) alongside OCR — barcodes are more reliable than text recognition
- The multi-rotation approach (0°, 90°, 270°) already exists and is a good foundation

### 6. Data Export Enhancements

Only Goodreads CSV export is currently supported:

- **JSON export/import** for full-fidelity backup and restore (most impactful addition)
- Support LibraryThing and StoryGraph CSV formats
- Add individual book sharing (copy a single book's details)

---

## Priority 3: Polish & Production Readiness

### 7. Documentation

The README is still Vite boilerplate:

- Project description with screenshots or demo GIF
- Setup and development instructions (`npm install && npm run dev`)
- Feature overview
- Deployment guide (GitHub Pages workflow is already configured)

### 8. Accessibility

- Add ARIA labels to icon-only buttons (scanner capture, debug toggle, manual input)
- Ensure keyboard navigation works through all views
- Add visible focus indicators beyond browser defaults
- Test with a screen reader

### 9. Offline / PWA Support

The app already uses localStorage for persistence, making it a good PWA candidate:

- Add a service worker for caching static assets (`vite-plugin-pwa`)
- Queue book lookups when offline, resolve when connectivity returns
- Add install prompt for "Add to Home Screen"

### 10. Cleanup

Minor items that improve code quality:

- Remove leftover `console.log` statements (especially in `Scanner.tsx` and `App.tsx`)
- Replace the placeholder Amazon affiliate tag (`tag=your-tag-20`) or remove it
- Remove unused `App.css` (styles are in `index.css` and inline)
- Consider extracting inline styles to CSS modules or a utility-class library
