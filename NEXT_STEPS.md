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

---

## Recommended Next Steps

Items are roughly ordered by impact vs. effort.

---

### 1. Star ratings

**Why:** Ratings are the most prominent missing feature compared to Goodreads/StoryGraph. Users expect to record how much they liked a book.

**What to add:**
- Add an optional `rating?: 1 | 2 | 3 | 4 | 5` field to `BookEntry` in `types.ts`.
- Render a 5-star picker in `BookDetail.tsx` (and compactly in `BookCard.tsx`).
- Add rating-based sorting in `LibraryList.tsx` (`SortField` union).
- Export the rating column in all export formats (`exportFormats.ts`, `goodreadsExport.ts`, etc.).
- Add a `rating` column to the Supabase `books` table (nullable integer 1–5) and update `syncBooks.ts`.

---

### 2. Reading dates (started / finished)

**Why:** `BookEntry` only stores `dateAdded`. Recording when a user started and finished a book unlocks accurate reading-pace statistics, year-in-review views, and a more meaningful history.

**What to add:**
- Add optional `dateStarted?: string` and `dateFinished?: string` (ISO date strings) to `BookEntry` in `types.ts`.
- Auto-set `dateStarted` when status changes to `'reading'`, and `dateFinished` when status changes to `'read'` or `'dnf'` — but allow manual override in the edit form in `BookDetail.tsx`.
- Surface both dates in the book detail view.
- Use `dateFinished` for a "Books read this year" count in the stats panel (`LibraryList.tsx`).
- Add both columns to the Supabase schema and include them in `syncBooks.ts` converters.

---

### 3. Timestamp-based sync conflict resolution

**Why:** The current merge strategy in `mergeBooksLists` (in `lib/syncBooks.ts`) is "local always wins." If a user deletes a book on device A and edits it offline on device B, the edit survives when device B syncs — the deletion is lost. The Supabase `books` table already has an `updated_at` column, but it is not propagated into `BookEntry` locally.

**What to change:**
- Add `updatedAt: string` to `BookEntry` in `types.ts`.
- Set `updatedAt` to `new Date().toISOString()` in every mutating action in `useBookStore.ts` (`addBook`, `updateBook`, `updateBookStatus`, `updateBookNotes`, `removeBook`).
- Update `mergeBooksLists` in `lib/syncBooks.ts` to compare `updatedAt` when both local and remote versions of a book exist, keeping the one with the later timestamp instead of always preferring local.
- Update `toBookEntry` / `toBookRow` converters to round-trip `updated_at` ↔ `updatedAt`.

---

### 4. Auto-sync on mutation (debounced)

**Why:** Sync currently requires pressing the "Sync" button in `AuthPanel`. The `useSyncQueue` store already tracks `pendingChanges`, but nothing triggers a flush automatically. Users will forget to sync and lose changes or see stale data on a second device.

**What to add:**
- In `App.tsx`, add a `useEffect` that watches `pendingChanges > 0` (and `online && user && !flushing`) and schedules a debounced flush (e.g. 30 seconds after the last mutation).
- Use `useRef` to hold the debounce timer so it is cancelled if the component unmounts or the user manually syncs first.
- This piggybacks on the existing `mergeSync` / `pushBooks` flow — no new Supabase calls needed.

---

### 5. Richer reading statistics

**Why:** The stats panel in `LibraryList.tsx` shows totals (to-read / reading / read / DNF / total pages). With reading dates (item 2) and ratings (item 1) in place, much more useful views become possible.

**Potential additions:**
- Books finished per month (bar chart or sparkline using only CSS/SVG — no charting library required).
- Average rating across finished books.
- Reading pace: average days per book (from `dateStarted` → `dateFinished`).
- "Read this year" counter with a configurable annual goal (store in `localStorage` alongside the library).
- Favorite author (most books read).

These can all be derived in a `useMemo` in `LibraryList.tsx` — no new dependencies needed.

---

### 6. Screen reader / keyboard accessibility audit

**Why:** `NEXT_STEPS.md` already flags this as remaining. The app uses `aria-label` on icon buttons and focus rings, but has not been tested with VoiceOver (macOS/iOS) or NVDA (Windows).

**What to do:**
- Walk through the three main views (Scanner, Library, Data) with VoiceOver / NVDA and fix any focus-order or announcement issues.
- Ensure the `<dialog>`-like overlay in `BookDetail` traps focus correctly and returns focus to the triggering element on close.
- Verify the shelf chip filter buttons and the sort dropdown announce their selected state.
- Add `role="status"` or `aria-live="polite"` to the Toast component so screen readers announce scan results.

---

### 7. Share / export a reading list (not just individual books)

**Why:** Individual book sharing (`shareBook.ts`) is implemented, but sharing a curated shelf or a "read in 2025" list as a link or image is a natural next step.

**Options (pick one):**
- **Text list:** Generate a plain-text or Markdown book list from a filtered view and copy it / invoke Web Share API (low effort).
- **Card image export:** Render the filtered book grid to a `<canvas>` and offer "Save as image" — useful for social media. (Higher effort; flagged in the existing NEXT_STEPS as "future.")

---

### 8. Google Books API key (optional, low priority)

**Why:** The app calls the Google Books API without a key (`useBookLookup.ts`). The unauthenticated quota is 1,000 requests/day per IP, which is fine for personal use but will rate-limit shared Vercel deployments.

**What to add:**
- Add an optional `VITE_GOOGLE_BOOKS_API_KEY` env var (document in `.env.example`).
- Append `&key=${import.meta.env.VITE_GOOGLE_BOOKS_API_KEY}` to the Google Books URL when the variable is set.
- No behavior change when the variable is absent — keeps zero-config setup working.

---

## Remaining (lower priority, from before)

### Accessibility
- Screen reader testing (VoiceOver / NVDA) — see item 6 above

### Optional polish
- Individual book sharing: card image export (future) — see item 7 above

---

## Archived

This doc previously listed many items as "recommended next steps." Those have been implemented. See the Completed table above.
