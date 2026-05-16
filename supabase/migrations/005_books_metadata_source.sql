alter table books
  add column if not exists metadata_source text null,
  add column if not exists user_edited_fields jsonb not null default '{}'::jsonb;
