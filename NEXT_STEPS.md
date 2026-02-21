# Spine Scanner — Next Steps

Status of recommended improvements. Items marked ✅ are implemented.

---

## Completed

| # | Item | Status |
|---|------|--------|
| 1 | TypeScript build errors | ✅ Fixed |
| 2 | Test coverage | ✅ 266 unit tests, Playwright E2E, mobile matrix |
| 3 | ISBN checksum validation | ✅ `isbnValidation.ts` |
| 4 | API resilience & caching | ✅ Retry, cache, debounce, Open Library fallback |
| 5 | Barcode scanning | ✅ ZXing + OCR pipeline |
| 6 | Library sorting & filtering | ✅ Sort, status filter, shelves, stats |
| 7 | JSON export/import | ✅ Full backup/restore |
| 8 | README & docs | ✅ Updated |
| 9 | Offline / PWA support | ✅ vite-plugin-pwa, service worker |
| 10 | Test step in deploy workflow | ✅ `npm run test` before build |
| 11 | Duplicate scan "Update notes" | ✅ Confirm dialog → Open in library |
| 12 | PWA icons (192, 512) | ✅ Generated from SVG |
| 13 | LibraryThing TSV, StoryGraph CSV | ✅ Export formats |
| 14 | Accessibility: aria-labels, focus ring | ✅ Icon buttons, nav, shelf chips |
| 15 | Amazon affiliate tag | ✅ `VITE_AMAZON_AFFILIATE_TAG` in .env |
| 16 | Individual book sharing | ✅ Share button, Web Share API, copy link, deep links `#book-ISBN` |
| 17 | Camera torch | ✅ Flashlight toggle for low light (mobile) |
| 18 | Scanner UX | ✅ Haptics on buttons, faster auto-scan (2s), OCR pre-warm on mount |
| 19 | Star ratings (1–5) | ✅ `rating` field in `types.ts`, 5-star picker in `BookDetail`, compact display in `BookCard`, rating sort in `LibraryList`, exported in all formats |
| 20 | Reading dates (started / finished) | ✅ `dateStarted` / `dateFinished` in `types.ts`, auto-set on status change in `useBookStore`, manual edit in `BookDetail`, used in stats |
| 21 | Timestamp-based sync conflict resolution | ✅ `updatedAt` in `BookEntry`, stamped on every mutation, `mergeBooksLists` picks newer timestamp, round-tripped in `syncBooks.ts` |
| 22 | Auto-sync on mutation (debounced) | ✅ 30 s debounce in `App.tsx` via `useEffect` + `useRef` timer, cancelled on manual sync |
| 23 | Richer reading statistics | ✅ Avg rating, books finished this year, avg pace (days/book), annual goal with progress bar, 12-month bar chart — all in `LibraryList.tsx` |
| 24 | Screen reader / keyboard accessibility | ✅ Focus trap in `BookDetail` modal, focus restored on close, `aria-pressed` on status/filter/sort/star buttons, `aria-expanded` on shelf picker |
| 25 | Share / export a reading list | ✅ `shareBookList` in `shareBook.ts`; "Copy list" button in `LibraryList` header uses Web Share API with clipboard fallback |
| 26 | Google Books API key (optional) | ✅ `VITE_GOOGLE_BOOKS_API_KEY` env var in `useBookLookup.ts` and documented in `.env.example` |

---

## Archived

This doc previously listed many items as "recommended next steps." Those have been implemented. See the Completed table above.
