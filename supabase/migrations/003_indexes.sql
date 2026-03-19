-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Performance indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Books: primary lookup pattern is by user_id + date_added (default sort)
create index if not exists books_user_date
  on public.books (user_id, date_added desc);

-- Books: sync conflict resolution reads updated_at
create index if not exists books_user_updated
  on public.books (user_id, updated_at desc);

-- Books: partial index for non-deleted books (most queries exclude tombstones)
create index if not exists books_active
  on public.books (user_id)
  where deleted_at is null;

-- Books: ISBN lookup (for duplicate detection)
create index if not exists books_isbn
  on public.books (isbn)
  where deleted_at is null;

-- Shelves: user lookup
create index if not exists shelves_user
  on public.shelves (user_id);

-- Profiles: indexed by PK (user_id), no extra index needed
