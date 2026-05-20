alter table books
  add column if not exists metadata_source text null,
  add column if not exists metadata_peers jsonb null,
  add column if not exists metadata_user_edited jsonb null;
