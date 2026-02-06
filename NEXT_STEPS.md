# Spine Scanner - Recommended Next Steps

## 1. Testing

The project has zero test coverage. Adding tests would improve reliability and make future changes safer.

- **Unit tests** for utility functions (`importLogic.ts`, `goodreadsExport.ts`, `amazonLink.ts`) -- these are pure functions and easy to test
- **Component tests** for `BookCard`, `LibraryList`, and `DataManagement` using React Testing Library
- **Integration test** for the Google Books API lookup flow (`useBookLookup`)
- **Setup**: Add Vitest (pairs naturally with Vite) and `@testing-library/react`

## 2. ISBN Validation

Currently, ISBN inputs are only checked for length (10 or 13 digits). Add proper checksum validation:

- **ISBN-10**: Weighted sum mod 11
- **ISBN-13**: Alternating 1/3 weighted sum mod 10
- Reject invalid checksums before making API calls to Google Books

## 3. API Resilience

The Google Books API integration has no rate limiting or error recovery:

- Add request debouncing/throttling to prevent rapid duplicate lookups
- Cache API responses (in-memory or localStorage) to avoid redundant network calls
- Add retry logic with exponential backoff for transient failures
- Consider a fallback data source (Open Library API) when Google Books returns no results

## 4. Offline Support

Since the app uses localStorage for persistence, it's a good candidate for offline-first:

- Add a service worker for caching static assets
- Queue book lookups when offline and resolve when connectivity returns
- Use Vite's PWA plugin (`vite-plugin-pwa`) for easy setup

## 5. Improved OCR Accuracy

The current OCR pipeline does basic grayscale + contrast preprocessing:

- Add image sharpening and binarization (adaptive threshold) before OCR
- Crop to the viewfinder region instead of processing the full frame
- Try multiple orientations (rotate 90/180/270) since book spines are vertical
- Consider using a barcode scanning library (e.g., `@AKCreations/zxing-js` or `quagga2`) for barcode detection alongside OCR text extraction

## 6. README & Documentation

The README is still the Vite boilerplate. Replace it with:

- Project description and screenshots/demo GIF
- Setup and development instructions
- Feature overview
- Deployment guide (GitHub Pages is already configured)

## 7. Accessibility

- Add ARIA labels to icon-only buttons (scanner capture, debug toggle, manual input)
- Ensure keyboard navigation works through the library and data management views
- Add visible focus indicators beyond browser defaults
- Test with a screen reader

## 8. Data Export Enhancements

Currently only Goodreads CSV export is supported:

- Add JSON export for full-fidelity backup/restore
- Add import from JSON to complement the export
- Support LibraryThing and StoryGraph CSV formats
- Add individual book export (share a single book entry)

## 9. Library Organization

- Add sorting options (by title, author, date added, page count)
- Add filtering by reading status (to-read, reading, read, dnf)
- Add tagging/shelving system for custom categorization
- Add reading statistics (total books, pages read, status breakdown)

## 10. Amazon Affiliate Link

The `amazonLink.ts` utility uses a placeholder affiliate tag (`tag=your-tag-20`). Either:

- Replace with a real affiliate tag if monetization is intended
- Remove the affiliate tag parameter entirely
