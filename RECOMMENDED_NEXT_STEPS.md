# Recommended Next Steps — All Phases

Detailed, actionable recommendations for every planned phase (25-34), based on a full audit of the codebase, architecture, test infrastructure, and current gaps.

---

## Priority Order

```
Priority  Phase  Focus
────────  ─────  ─────────────────────────────
  NOW       —    Mobile UX audit fixes
  NOW      25    Scan accuracy hardening
  NEXT     26    Metadata quality layer
  NEXT     27    Reading workflow expansion
  SOON     28    Collections and smart shelves
  SOON     29    Social and household sharing
  SOON     30    Cloud sync V2
  LATER    31    Insights and recommendations
  LATER    32    Accessibility and inclusive UX
  LATER    33    Platform integrations
  LATER    34    Release readiness and growth
```

---

## Pre-Phase: Mobile UX Audit Fixes

Before starting the roadmap phases, close out the remaining items from the mobile audit. These are low-effort, high-value fixes that benefit every mobile user immediately.

### What to do

| Task | Details |
|------|---------|
| Touch targets | Add `min-height: 44px; min-width: 44px` to `.navBtn` and all interactive elements. Test on a 320px viewport. |
| `touch-action: manipulation` | Apply to all buttons and links in `index.css`. Eliminates the 300ms tap delay on browsers that still honor it. |
| Bottom nav on mobile | Move Scanner / Library / Profile tabs to a fixed bottom bar on viewports under 640px. Top nav stays for desktop. Requires a media query in `App.css` and repositioning the nav in `App.tsx`. |
| Skeleton loaders | Replace "Loading scanner..." / "Loading library..." text in Suspense fallbacks with skeleton placeholders (gray pulsing rectangles matching the expected layout). |

### Files to change
- `src/App.css` — nav positioning, touch targets
- `src/index.css` — `touch-action: manipulation` global rule
- `src/App.tsx` — bottom nav layout for mobile breakpoint
- Suspense fallback components (inline in `App.tsx`)

---

## Phase 25 — Scan Accuracy Hardening

**Goal**: Reduce failed scans and shorten time-to-add on real devices.

### Current state

The scan pipeline (`useScanPipeline.ts`, 47KB) is already sophisticated:
- 5 barcode crop strategies (full, center, narrow, medium, wide)
- 20+ adaptive OCR passes with quality-driven preprocessing
- Confidence scoring with HIGH (≥85), MEDIUM (≥60), LOW (<60) bands
- Quality gates: blur variance (120), dark scene (90), combined blur+dark skip (70)
- Checksum repair targeting low-confidence digit positions
- 35-second total timeout across all passes

The image processing layer (`imageProcessing.ts`, 27KB) has: Otsu binarization, Sauvola adaptive threshold, median filter, morphological close, CLAHE, skew detection (±15°), text region detection, and perspective correction (DLT).

### Specific recommendations

**1. Build a benchmark fixture set**
- Collect 20-30 real-world failure cases: glossy covers, partial barcodes, rotated spines (>15°), dim captures, curved spines, stickers over barcodes.
- Store as test fixtures in `e2e/fixtures/scan-benchmark/`.
- Write a Vitest suite that runs each fixture through `useScanPipeline` and asserts ISBN extraction. Track pass/fail rates over time.
- Define targets: 85% success rate on the benchmark set, median time-to-add under 8 seconds.

**2. Add per-pass timeout**
- Currently only a 35s total timeout exists. A single slow pass can starve later (potentially better) passes.
- Add a 5s per-pass timeout in the OCR loop. If a pass exceeds it, abort and move to the next.
- File: `src/hooks/useScanPipeline.ts`, the OCR pass loop starting around the `runOcr` calls.

**3. Dynamic pass pruning**
- If 3 consecutive OCR passes return zero ISBN candidates, skip the remaining passes in that crop/rotation group.
- Saves time on clearly non-scannable images and gets the user to manual entry faster.

**4. Enable perspective correction**
- `applyPerspectiveCorrection()` exists in `imageProcessing.ts` but is never called from the pipeline.
- Add a perspective correction pass for images where text region detection finds a skewed quad. This helps with angled phone captures.

**5. Widen skew detection range**
- Currently limited to ±15° with 0.5° steps. Extend to ±30° for books photographed at steeper angles.
- File: `src/utils/imageProcessing.ts`, `detectSkewAngle()`.

**6. Surface diagnostics in the UI**
- `ocrDiagnostics.ts` already computes brightness, blur, contrast, DPI, and pass count. The Scanner shows live quality hints ("Too dark", "Blurry") but doesn't show a post-scan diagnostic summary on failure.
- Add an expandable "Why did this fail?" panel after a failed scan showing: brightness level, blur score, contrast, number of passes attempted, best candidate found (if any), and specific tips.
- File: `src/components/Scanner.tsx`, after the error toast.

**7. Structured diagnostic logging for analytics**
- Current diagnostics are formatted strings. Add a `logScanAttempt()` to the analytics store that records: timestamp, success/fail, detection method, confidence, brightness, blur, pass count, time elapsed.
- This creates a dataset for identifying the most common failure patterns.

### Files to change
- `src/hooks/useScanPipeline.ts` — per-pass timeout, pass pruning, perspective correction call
- `src/utils/imageProcessing.ts` — wider skew range
- `src/components/Scanner.tsx` — failure diagnostics panel
- `src/utils/ocrDiagnostics.ts` — structured metric output
- `src/store/useAnalyticsStore.ts` — scan attempt logging
- New: `e2e/fixtures/scan-benchmark/` — fixture images
- New: `src/hooks/__tests__/useScanPipeline.benchmark.test.ts`

---

## Phase 26 — Metadata Quality Layer

**Goal**: Make imported book data more trustworthy and editable in bulk.

### Current state

`useBookLookup.ts` queries Google Books first, falls back to Open Library, then retries with ISBN-10↔13 conversion. It uses an in-memory Map cache with no eviction. The `BookEntry` type stores flat fields (title, author, pageCount, coverImg) with no provenance tracking.

### Specific recommendations

**1. Source attribution per field**
- Extend `BookEntry` in `types.ts` with an optional `metadata` field:
  ```typescript
  metadata?: {
    sources?: Record<string, 'google' | 'openlibrary' | 'manual'>;
    lastRefreshed?: string;
    confidence?: Record<string, number>;
  };
  ```
- When `useBookLookup` returns data, tag each field with its source.
- Display source badges (e.g., small "G" / "OL" / "Manual" icons) next to each field in the book detail view.

**2. Conflict resolution when sources disagree**
- When both Google Books and Open Library return results, compare fields. If they differ on author, title, or pageCount, present a picker UI.
- Default to Google Books (more comprehensive) but show the alternative.
- File: `src/hooks/useBookLookup.ts` — fetch from both sources in parallel, return a merged result with conflicts flagged.

**3. Protect manual edits**
- Add a `manuallyEdited` set to `BookEntry.metadata` tracking which fields the user has touched.
- During metadata refresh, skip fields in `manuallyEdited`.
- File: `src/store/useBookStore.ts` (`updateBook` action), book detail edit UI.

**4. Bulk metadata refresh**
- Add a "Refresh all metadata" action in DataManagement that iterates through books, re-fetches from APIs, and updates non-manual fields.
- Use a batch queue with 300ms delays to avoid rate limiting.
- Show progress: "Refreshing 42/150 books..."
- File: `src/components/DataManagement.tsx`, new `useMetadataRefresh` hook.

**5. Missing cover recovery**
- When a book has no `coverImg`, show a placeholder with a "Find cover" button.
- Search Open Library Covers API (`covers.openlibrary.org/b/isbn/{isbn}-M.jpg`) and Google Books thumbnail.
- Let the user pick from available options or upload their own.
- File: Book detail component, `useBookLookup.ts`.

**6. Persistent metadata cache**
- Replace the in-memory Map in `useBookLookup.ts` with an IndexedDB-backed cache (or localStorage with LRU eviction).
- TTL: 7 days for API results. Manual edits never expire.
- This enables offline metadata display and reduces redundant API calls.

**7. Edition-aware matching**
- ISBNs are edition-specific. When metadata includes a "work" identifier (Open Library has this), link editions together.
- Surface "Other editions" in the book detail view when available.

### Files to change
- `src/types.ts` — extend `BookEntry` with `metadata` field
- `src/hooks/useBookLookup.ts` — parallel fetch, conflict detection, persistent cache
- `src/store/useBookStore.ts` — `manuallyEdited` tracking in `updateBook`
- `src/components/DataManagement.tsx` — bulk refresh action
- Book detail component — source badges, cover recovery, edition links
- New: `src/hooks/useMetadataRefresh.ts`

---

## Phase 27 — Reading Workflow Expansion

**Goal**: Turn the library into an active reading tracker, not just a catalog.

### Current state

`BookEntry` has a `status` field with 4 values: `to-read`, `reading`, `read`, `dnf`. There are no reading progress fields, no start/finish dates, no reading session tracking. The `LibraryList` shows collection stats (total, to-read count, reading count) and a completion percentage.

### Specific recommendations

**1. Extend the data model**
Add to `BookEntry` in `types.ts`:
```typescript
readingProgress?: {
  pagesRead?: number;
  percentComplete?: number;
  startedAt?: string;    // ISO date
  finishedAt?: string;   // ISO date
};
statusHistory?: Array<{
  status: string;
  changedAt: string;
}>;
rating?: number;           // 1-5 stars
```

Keep all fields optional for backward compatibility. Existing books without these fields continue to work.

**2. Quick status actions from library view**
- Add swipe actions or long-press menu on book cards: "Start reading", "Finished", "Update progress".
- One-tap "Mark as reading" should auto-set `startedAt` to today.
- One-tap "Finished" should set `finishedAt` and `percentComplete: 100`.
- File: `src/components/BookCard.tsx` or inline in `LibraryList.tsx`.

**3. Progress logging**
- Add a lightweight progress input: a slider or number field for pages read.
- Auto-compute `percentComplete` from `pagesRead / pageCount`.
- Show a progress bar on the book card in grid view.
- Keep it fast: the input should overlay the book detail, not open a new view.

**4. Reading streaks and goals**
- Add a `readingGoals` field to `ProfilePreferences`:
  ```typescript
  readingGoals?: {
    yearlyTarget?: number;
    dailyStreakEnabled?: boolean;
  };
  ```
- Track streak by checking if at least one `statusHistory` entry exists per day.
- Show streak count and yearly progress (e.g., "12/52 books this year") in library stats.
- All computed client-side from existing data — works offline.

**5. Richer stats cards**
- Extend the existing stats panel in `LibraryList` with:
  - Books finished this month/year
  - Total pages read (sum of `pagesRead` across books with status `read`)
  - Average book length
  - Current streak
- File: `src/components/LibraryList.tsx`, the stats section.

**6. Status history for timeline**
- Record every status change in `statusHistory` array.
- This enables a future "reading timeline" view showing when books were started, paused, and finished.
- File: `src/store/useBookStore.ts` (`updateBookStatus` action).

### Migration
- No migration needed. All new fields are optional.
- Existing books keep working. Progress fields appear as empty until the user interacts.

### Supabase schema change
- Add columns to the `books` table: `pages_read INT`, `percent_complete REAL`, `started_at TIMESTAMPTZ`, `finished_at TIMESTAMPTZ`, `status_history JSONB`, `rating SMALLINT`.
- New migration: `supabase/migrations/004_reading_progress.sql`.

### Files to change
- `src/types.ts` — extend `BookEntry`
- `src/store/useBookStore.ts` — status history tracking, progress updates
- `src/store/useProfileStore.ts` — reading goals preferences
- `src/components/LibraryList.tsx` — progress bars, richer stats
- `src/components/BookCard.tsx` — quick actions, progress indicator
- `src/lib/syncBooks.ts` — sync new fields
- Book detail component — progress input, rating
- New: `supabase/migrations/004_reading_progress.sql`

---

## Phase 28 — Collections and Smart Shelves

**Goal**: Help users organize large libraries without manual tagging overhead.

### Current state

Shelves are simple objects (`{ id, name, color }`) with 10 preset colors. Books reference shelves via `shelfIds[]` (many-to-many). `LibraryList` supports single-shelf filtering combined with status filtering and text search. No shelf ordering, no rules, no saved filters.

### Specific recommendations

**1. Saved filters (saved searches)**
- Add a `SavedFilter` type:
  ```typescript
  SavedFilter {
    id: string;
    name: string;
    query?: string;
    statusFilter?: string;
    shelfFilter?: string;
    sortBy?: string;
    sortAsc?: boolean;
    pageCountRange?: [number, number];
  }
  ```
- Store in `useBookStore` alongside shelves.
- Add a "Save current filter" button in the library toolbar.
- Display saved filters as chips above the book grid.

**2. Rule-based smart shelves**
- Extend `Shelf` with an optional `rules` field:
  ```typescript
  Shelf {
    id, name, color;
    rules?: {
      statusIn?: string[];
      pageCountMin?: number;
      pageCountMax?: number;
      authorContains?: string;
      titleContains?: string;
      addedAfter?: string;
      ratingMin?: number;
    };
    isSmartShelf?: boolean;
  }
  ```
- Smart shelves auto-populate by evaluating rules against the library.
- Keep manual shelves and smart shelves visually distinct (e.g., smart shelves get a small lightning bolt icon).
- File: `src/store/useBookStore.ts` — add `getSmartShelfBooks(shelfId)` selector.

**3. Shelf templates**
- Provide preset smart shelves on first use: "Currently reading", "Unread (100+ pages)", "Finished this year", "Short reads (<200 pages)".
- User can delete or modify them.

**4. Multi-select and bulk actions**
- Add a selection mode to `LibraryList`: long-press or checkbox to select multiple books.
- Bulk actions: assign shelf, change status, delete, export selection.
- Build selection UX mobile-first: floating action bar at bottom with selected count and action buttons.
- Defer this until the base shelf/filter UX is solid. Ship filters first, bulk actions second.

**5. Sort presets**
- Let users save sort configurations (e.g., "By author A-Z", "Recently added", "Shortest first").
- Store as part of `SavedFilter` or as standalone presets.

**6. Archive / hidden shelf**
- Add a built-in "Archive" shelf that hides books from the default library view.
- Archived books still count in stats but don't clutter the main grid.
- Toggle visibility in the library toolbar.

### Files to change
- `src/types.ts` — `SavedFilter`, extend `Shelf` with rules
- `src/store/useBookStore.ts` — saved filters, smart shelf evaluation, archive support
- `src/components/LibraryList.tsx` — filter chips, multi-select, bulk actions, archive toggle
- `src/lib/syncBooks.ts` — sync saved filters and smart shelf rules
- New: `src/components/ShelfRuleEditor.tsx` — rule builder UI

---

## Phase 29 — Social and Household Sharing

**Goal**: Support shared libraries across families, clubs, or small teams.

### Current state

No sharing infrastructure exists. Auth is per-user via Supabase. Books and shelves are user-scoped with `user_id` partitioning. Row-level security on the profiles table enforces user-only access.

### Specific recommendations

**1. Data model for sharing**
New Supabase tables:
```sql
-- Households / groups
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Membership with roles
CREATE TABLE household_members (
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- Shared shelves (link a shelf to a household)
CREATE TABLE shared_shelves (
  shelf_id UUID,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  shared_by UUID REFERENCES auth.users(id),
  shared_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (shelf_id, household_id)
);

-- Book lending
CREATE TABLE book_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL,
  lender_id UUID REFERENCES auth.users(id),
  borrower_id UUID REFERENCES auth.users(id),
  lent_at TIMESTAMPTZ DEFAULT now(),
  due_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  notes TEXT
);
```

**2. Start with trusted household sharing**
- Invite by email or share code. No public discovery.
- Roles: owner (full control), editor (add/edit books), viewer (read-only).
- Shared shelves appear in each member's library with a "shared" badge.
- Edits sync via Supabase real-time subscriptions.

**3. Lend/borrow tracking**
- Add a "Lend to..." action on book detail.
- Pick a household member or enter a name (for non-app-users).
- Show lending status on the book card: "Lent to Sarah" with return date.
- Optional reminders (browser notification) when due date approaches.
- This is a small, high-value feature that can ship before full sharing.

**4. Activity feed**
- Show recent changes in shared households: "Sarah added 3 books", "Alex finished reading X".
- Stored as events in a `household_activity` table.
- Displayed in a new "Activity" tab within household view.

**5. Permission modeling**
- Row-level security policies on all shared tables.
- Viewers can read, editors can write, owners can manage members.
- Edits and deletes are reversible (soft delete with 30-day retention for shared items).
- Book ownership remains with the original user even when shared.

**6. Incremental rollout**
- Phase 29a: Household creation, member invites, role assignment.
- Phase 29b: Shared shelves with real-time sync.
- Phase 29c: Lending tracker with reminders.
- Phase 29d: Activity feed.

### Files to change
- New: `supabase/migrations/005_households.sql`
- New: `supabase/migrations/006_book_loans.sql`
- New: `src/store/useHouseholdStore.ts`
- New: `src/components/HouseholdManager.tsx`
- New: `src/components/LendingTracker.tsx`
- `src/lib/syncBooks.ts` — shared shelf sync
- `src/components/LibraryList.tsx` — shared shelf badge, lending status
- Book detail component — "Lend to..." action

---

## Phase 30 — Cloud Sync V2

**Goal**: Make sync safer, clearer, and more resilient across devices.

### Current state

`syncBooks.ts` implements full-state sync: pull all remote books → merge (local wins) → push entire library back. `useSyncQueue` is a simple dirty counter (not an operation journal). No conflict detection, no per-item sync status, no transaction boundaries. Sync triggers on signin, reconnect, and manual flush.

### Specific recommendations

**1. Sync history panel**
- Record each sync operation: timestamp, direction (push/pull/merge), item count, duration, success/failure.
- Store in a new `useSyncHistoryStore` (localStorage, last 50 entries).
- Display in a "Sync History" section under Data Management.
- Shows: "Last sync: 2 min ago — pushed 3 books, pulled 1 shelf".

**2. Conflict detection and resolution UI**
- During merge, detect when the same book was modified on both sides (compare `updated_at` timestamps).
- Instead of silently picking local, show a conflict UI: side-by-side comparison of local vs remote values per field.
- Let the user pick per-field or "keep local" / "keep remote" for the whole book.
- File: New `src/components/SyncConflictResolver.tsx`.

**3. Offline queue inspector**
- Replace the dirty counter with an operation journal:
  ```typescript
  SyncOperation {
    id: string;
    type: 'add' | 'update' | 'delete';
    entityType: 'book' | 'shelf';
    entityId: string;
    timestamp: string;
    payload: Partial<BookEntry | Shelf>;
  }
  ```
- Show pending operations in the UI: "3 changes waiting to sync".
- Let users inspect and discard individual pending changes.
- File: `src/store/useSyncQueue.ts` — replace counter with journal.

**4. Background retry strategy**
- Current: no automatic retry after failure (user must tap "Sync now" or wait for reconnect).
- Add exponential backoff retry: 30s, 1m, 2m, 5m, max 15m.
- Cancel retry queue on manual sync or signout.
- Show retry countdown in the UI.

**5. Last-good snapshot restore**
- Before each push, save a snapshot of the current library to IndexedDB.
- If a sync corrupts data, offer "Restore last good backup" in Data Management.
- Keep last 3 snapshots with timestamps.

**6. Delta sync (incremental)**
- Current approach sends the entire library on every sync. For large libraries (1000+ books) this is wasteful.
- Use `updated_at` timestamps to sync only changed items since `lastSyncedAt`.
- Requires server-side support: add an index on `(user_id, updated_at)` in the books table.
- Soft deletes needed: add `deleted_at` column instead of hard DELETE.

**7. Multi-device conflict testing**
- Add E2E tests that simulate two concurrent sessions editing the same book.
- Test: edit on device A, edit on device B, sync both, verify conflict UI appears.
- File: New `e2e/sync-conflict.spec.ts`.

### Files to change
- `src/store/useSyncQueue.ts` — operation journal, retry strategy
- `src/lib/syncBooks.ts` — delta sync, conflict detection, snapshot
- New: `src/store/useSyncHistoryStore.ts`
- New: `src/components/SyncConflictResolver.tsx`
- New: `src/components/SyncHistoryPanel.tsx`
- `src/components/DataManagement.tsx` — sync history, snapshot restore
- `src/App.tsx` — retry timer integration
- New: `supabase/migrations/007_soft_deletes.sql`
- New: `e2e/sync-conflict.spec.ts`

---

## Phase 31 — Insights and Recommendations

**Goal**: Surface useful patterns from the user's own library behavior.

### Current state

`useAnalyticsStore` collects events (scan success/failure, book added/removed, import/export, sync) with a 5000-event cap. `LibraryList` shows basic stats (total books, to-read count, completion %). No recommendation engine, no reading pattern analysis, no duplicate detection.

### Specific recommendations

**1. Reading pattern analysis**
- Compute from library data (no external services):
  - Average pages per book (overall and by status)
  - Reading pace: books finished per month (from `finishedAt` dates, Phase 27)
  - Genre/length preferences (cluster by page count)
  - Most productive reading months
- Display as charts in a new "Insights" view.

**2. Unread backlog insights**
- "You have 47 unread books. At your current pace, that's about 2 years of reading."
- "Your 5 shortest unread books" — quick wins to reduce the backlog.
- "Books you've had the longest without reading" — nudge to start or remove.

**3. Duplicate and edition detection**
- Scan the library for books with:
  - Same title + author (different ISBNs = different editions)
  - Similar titles (fuzzy match with Levenshtein distance)
  - Same ISBN added twice (shouldn't happen but defensive)
- Show a "Potential duplicates" section with merge/remove actions.

**4. Series completion hints**
- When a book is part of a series (Open Library has series data), check if other books in the series are in the library.
- Show "You have 2 of 5 books in the Dune series" with links to missing volumes.
- Requires fetching series data from Open Library's works API.

**5. Year-in-books report**
- Exportable summary: books read, pages consumed, favorite genres, reading streaks, longest book, fastest read.
- Shareable as an image or PDF.
- Triggered from Insights view, computed entirely client-side.

**6. Personalized recommendations**
- "Because you read X, you might like Y" — based on author, page count, and shelf overlap.
- Keep logic transparent: always show "why" a book is suggested.
- Use Open Library's "subjects" and "related works" APIs for suggestions.
- No external recommendation service — all computed locally from owned data.

### Files to change
- New: `src/components/InsightsView.tsx` — charts, patterns, reports
- New: `src/hooks/useLibraryInsights.ts` — computation logic
- New: `src/utils/duplicateDetection.ts` — fuzzy matching
- New: `src/utils/seriesCompletion.ts` — series data fetching
- `src/App.tsx` — add Insights view/tab
- `src/store/useAnalyticsStore.ts` — structured reading metrics

---

## Phase 32 — Accessibility and Inclusive UX

**Goal**: Reach a production-ready accessibility bar across devices.

### Current state

Good foundations: ARIA labels on icon buttons, focus trap for modals, skip link, `prefers-reduced-motion` support, keyboard-accessible nav. No automated accessibility testing in CI. No real assistive tech validation.

### Specific recommendations

**1. Add accessibility CI checks immediately**
This doesn't need to wait for Phase 32. Add now and fix issues as they arise:
- Install `eslint-plugin-jsx-a11y` and add to `eslint.config.js`. Catches missing alt text, labels, roles at lint time.
- Install `@axe-core/playwright` and add accessibility scans to E2E tests. Fail CI on critical violations.
- Add Lighthouse CI audit to the deploy pipeline. Set accessibility threshold at 90+.

**2. Real-device VoiceOver / NVDA audits**
- Create an accessibility test script covering: scan a book, navigate library, open book detail, edit a book, use shelves, change settings.
- Test with VoiceOver (iOS/macOS Safari) and NVDA (Windows Chrome).
- Document findings in an `ACCESSIBILITY_AUDIT.md`.
- Budget one full day for manual audit. Fix critical issues immediately; file the rest as GitHub issues.

**3. Larger touch-target pass**
- Audit every interactive element for 44×44px minimum (WCAG 2.5.5 AAA, 2.5.8 AA in WCAG 2.2).
- Common offenders: shelf color chips, close buttons, nav icons, filter chips.
- File: `src/App.css`, component-specific styles.

**4. High-contrast mode**
- Add a `prefers-contrast: more` media query that increases border widths, text weight, and background contrast.
- Test with Windows High Contrast mode enabled.

**5. Keyboard-only scanner alternative**
- The scanner requires a camera, which isn't keyboard-accessible. Ensure the manual ISBN entry and file upload paths are fully keyboard-navigable.
- Add keyboard shortcut hints: "Press M for manual entry", "Press U to upload a photo".
- File: `src/components/Scanner.tsx`.

**6. Dyslexia-friendly typography option**
- Add a preference toggle for a dyslexia-friendly font (OpenDyslexic or similar).
- Increase line spacing and letter spacing when enabled.
- File: `src/store/useProfileStore.ts` (new preference), `src/index.css`.

**7. Progress bar announcements**
- The OCR progress bar in Scanner lacks a text announcement for screen readers.
- Add `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and a visually hidden percentage text.
- File: `src/components/Scanner.tsx`.

**8. Motion controls**
- Currently `prefers-reduced-motion` disables CSS transitions. Extend to also disable: success flash animation, haptic vibrations, auto-scan polling.
- File: `src/components/Scanner.tsx`, `src/utils/haptics.ts`.

### Files to change
- `eslint.config.js` — add jsx-a11y plugin
- `e2e/app.spec.ts` — axe-core scans
- `.github/workflows/ci.yml` — Lighthouse CI step
- `src/components/Scanner.tsx` — keyboard shortcuts, progress announcements, motion controls
- `src/index.css` / `src/App.css` — high contrast, dyslexia font, touch targets
- `src/store/useProfileStore.ts` — new accessibility preferences
- `src/utils/haptics.ts` — respect reduced motion
- New: `ACCESSIBILITY_AUDIT.md`

---

## Phase 33 — Platform Integrations

**Goal**: Connect Spine Scanner to the rest of a reader's ecosystem.

### Current state

Import: JSON (native), CSV (Goodreads format detection), TSV (LibraryThing), TXT (ISBN list), web URL (ISBN extraction). Export: JSON, Goodreads CSV, LibraryThing TSV, StoryGraph CSV. No direct API integrations with external platforms.

### Specific recommendations

**1. Native Goodreads history importer**
- Parse the Goodreads CSV export format (which the app already handles in `importLogic.ts`).
- Enhance to extract: reading dates, ratings, shelves, reviews — not just ISBNs.
- Map Goodreads shelves to local shelves automatically.
- File: `src/utils/importLogic.ts` — extend CSV parser with Goodreads-specific field mapping.

**2. Native StoryGraph importer**
- Similar to Goodreads: parse StoryGraph's export CSV format.
- Map status values: "to-read" → "to-read", "currently-reading" → "reading", "read" → "read", "did-not-finish" → "dnf".
- Extract ratings and reviews.

**3. Calendar export for reading goals**
- Generate `.ics` calendar events from reading goals (Phase 27).
- "Finish 'Dune' by March 30" → calendar event with reminder.
- Download as `.ics` file or copy webcal:// URL.
- New utility: `src/utils/calendarExport.ts`.

**4. Notion export**
- Generate a Notion-compatible CSV or Markdown table from the library.
- Columns: Title, Author, Status, Pages, Rating, Date Added, Shelves.
- File: `src/utils/exportFormats.ts` — add Notion format.

**5. Webhook events (optional)**
- Add an optional webhook URL in settings.
- Fire events on: book added, book finished, status changed.
- Payload: `{ event, book, timestamp }`.
- Use case: IFTTT integration, custom automations, Discord notifications.
- File: New `src/lib/webhooks.ts`, `src/store/useProfileStore.ts` (webhook URL setting).

**6. Richer share targets**
- Register as a PWA share target so other apps can share ISBNs/URLs to Spine Scanner.
- Add to `manifest.json`:
  ```json
  "share_target": {
    "action": "/share",
    "method": "GET",
    "params": { "text": "shared_text" }
  }
  ```
- Parse shared text for ISBNs or book URLs (Amazon, Goodreads).
- File: `vite.config.ts` (PWA manifest), `src/App.tsx` (share handler).

**7. Incremental approach**
- Phase 33a: Enhanced Goodreads + StoryGraph importers (reuse existing parsing).
- Phase 33b: Calendar and Notion exports (new export formats).
- Phase 33c: Webhooks and share targets (new infrastructure).

### Files to change
- `src/utils/importLogic.ts` — enhanced Goodreads/StoryGraph parsing
- `src/utils/exportFormats.ts` — Notion format
- New: `src/utils/calendarExport.ts`
- New: `src/lib/webhooks.ts`
- `src/store/useProfileStore.ts` — webhook URL preference
- `vite.config.ts` — PWA share target
- `src/App.tsx` — share handler route
- `src/components/DataManagement.tsx` — new import/export options

---

## Phase 34 — Release Readiness and Growth

**Goal**: Prepare the app for broader public launch and ongoing maintenance.

### Current state

Deployed to GitHub Pages via CI. Optional Sentry error monitoring. No feature flags, no onboarding flow, no changelog, no support diagnostics. PWA installable with service worker caching.

### Specific recommendations

**1. In-app onboarding**
- First-time user flow: welcome screen → "Scan your first book" → success celebration → "Explore your library".
- Store `hasCompletedOnboarding` in preferences.
- Keep it short (3-4 steps max). Users should be scanning within 30 seconds.
- File: New `src/components/OnboardingFlow.tsx`.

**2. Feature flags**
- Add a lightweight feature flag system. No external service needed at this scale.
- Store flags in `ProfilePreferences`:
  ```typescript
  featureFlags?: Record<string, boolean>;
  ```
- Default flags defined in code. Admin/developer can override via a hidden settings panel.
- Use: gate unfinished features during development, A/B test new UI variants.
- File: New `src/lib/featureFlags.ts`, `src/store/useProfileStore.ts`.

**3. Changelog and release notes**
- Add a "What's new" modal that shows on first launch after an update.
- Store changelog entries in a static JSON file (`src/changelog.json`).
- Compare current version against `lastSeenVersion` in preferences.
- File: New `src/components/WhatsNew.tsx`, `src/changelog.json`.

**4. Support diagnostics bundle**
- Add a "Download debug info" button in settings that exports:
  - App version, browser/OS, screen size
  - Library stats (book count, shelf count — no PII)
  - Recent sync history
  - Recent scan diagnostics (last 10 attempts)
  - Feature flags
  - Error log (last 20 Sentry breadcrumbs, if enabled)
- Exported as a JSON file the user can attach to a bug report.
- File: New `src/utils/diagnosticsBundle.ts`.

**5. Privacy controls**
- Add clear data management: "Delete all my data" (local + cloud), "Export everything", "Disable analytics".
- GDPR-compatible: show what data is collected and where it's stored.
- Add a privacy policy link (even a simple one).
- File: `src/components/DataManagement.tsx`, new privacy section.

**6. Deployment and rollback playbooks**
- Document the deployment process in a `DEPLOYMENT.md`:
  - How to deploy (push to main)
  - How to rollback (revert commit, force push, or pin to previous commit SHA)
  - How to test in staging (preview deployments on Vercel)
  - How to monitor post-deploy (Sentry dashboard, GitHub Actions status)
- Add a manual "deploy to staging" workflow in GitHub Actions for pre-release testing.

**7. Admin telemetry dashboard**
- If analytics are opted in, aggregate anonymous usage data:
  - Daily/weekly active users (from sync timestamps)
  - Scan success rates across the user base
  - Most common scan failure reasons
  - Library size distribution
- This requires a minimal backend endpoint (Supabase Edge Function or Vercel serverless).
- File: New Supabase Edge Function, new admin dashboard component.

**8. Performance budgets**
- Add Lighthouse CI to the deploy pipeline with budgets:
  - Performance: >80
  - Accessibility: >90
  - Best Practices: >90
  - PWA: >90
- Fail deploy on regression.
- File: `.github/workflows/deploy.yml`, new `lighthouserc.json`.

### Files to change
- New: `src/components/OnboardingFlow.tsx`
- New: `src/lib/featureFlags.ts`
- New: `src/components/WhatsNew.tsx` + `src/changelog.json`
- New: `src/utils/diagnosticsBundle.ts`
- New: `DEPLOYMENT.md`
- `src/components/DataManagement.tsx` — privacy controls
- `src/store/useProfileStore.ts` — onboarding, feature flags, lastSeenVersion
- `.github/workflows/deploy.yml` — Lighthouse CI, staging deploy
- New: `lighthouserc.json`

---

## Cross-Cutting: Infrastructure to Build Along the Way

These items support multiple phases and should be built incrementally.

| Item | Supports Phases | Recommendation |
|------|-----------------|----------------|
| **Accessibility CI** (axe-core + jsx-a11y + Lighthouse) | 32, 34 | Add in Phase 25. Low effort, prevents regressions. |
| **Feature flags** | 34 (all phases) | Add in Phase 27. Gate reading workflow features during development. |
| **Operation journal for sync** | 28, 29, 30 | Build in Phase 28. Smart shelves need reliable sync of rules. |
| **Supabase schema migrations** | 27, 29, 30 | Start migration discipline in Phase 27. Number sequentially. |
| **Structured analytics** | 25, 31 | Add structured scan metrics in Phase 25. Reuse in Phase 31. |
| **E2E test expansion** | All | Add tests for each phase's features as they ship. |
| **IndexedDB for caching** | 26, 30 | Add in Phase 26 for metadata cache. Reuse in Phase 30 for sync snapshots. |

---

## Housekeeping — Do Anytime

| Task | Effort | Notes |
|------|--------|-------|
| Delete stale error files (`ts_errors.txt`, `tsc_errors.txt`, `build_output.txt`) | 5 min | Outdated TypeScript errors, noise in the repo |
| Add a `CLAUDE.md` | 30 min | Project conventions, test commands, architecture notes |
| Raise test coverage to 70%+ | Ongoing | Focus on `useScanPipeline.ts` and `imageProcessing.ts` |
| Clean up OCR cache eviction | 1 hr | Current FIFO with 30-item cap; switch to proper LRU |
| Fix Gaussian elimination stability | 1 hr | `imageProcessing.ts` perspective correction has no pivoting |

---

## Guiding Principle

**Make scanning and organizing books excellent before adding social, insights, or platform features.** Each phase builds confidence in the layer below it: accurate scanning (25) feeds trustworthy metadata (26), which supports meaningful reading tracking (27), which enables smart organization (28), which makes sharing valuable (29).
