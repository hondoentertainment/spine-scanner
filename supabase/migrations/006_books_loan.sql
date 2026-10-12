alter table books
  add column if not exists loan jsonb null;
