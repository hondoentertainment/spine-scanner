-- Columns the shared book writer sends on every save
-- (packages/shared books API, used by the PWA sync and the iOS app).
--
-- Migrations 004–008 add these same columns. This file is a no-op when
-- those already ran. It finishes a database that only has
-- 000_books_shelves.sql, or the README create-table snippet, so a save
-- does not depend on applying five files in order.
-- Safe to re-run.

alter table public.books
  add column if not exists is_photo_only boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text not null default '',
  add column if not exists pages_finished integer not null default 0,
  add column if not exists started_at timestamptz null,
  add column if not exists finished_at timestamptz null,
  add column if not exists last_progress_at timestamptz null,
  add column if not exists metadata_source text null,
  add column if not exists user_edited_fields jsonb not null default '{}'::jsonb,
  add column if not exists loan jsonb null,
  add column if not exists location_room text not null default '',
  add column if not exists location_case text not null default '',
  add column if not exists location_shelf text not null default '',
  add column if not exists loan_ledger jsonb not null default '[]'::jsonb;
