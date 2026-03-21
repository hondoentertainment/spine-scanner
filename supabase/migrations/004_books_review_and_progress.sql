alter table books
  add column if not exists is_photo_only boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text not null default '',
  add column if not exists pages_finished integer not null default 0,
  add column if not exists started_at timestamptz null,
  add column if not exists finished_at timestamptz null,
  add column if not exists last_progress_at timestamptz null;
