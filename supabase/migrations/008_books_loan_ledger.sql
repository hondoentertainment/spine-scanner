-- Lending ledger history. The current loan still lives in `loan`.
-- An empty array means the copy has never been lent. Safe to re-run.
alter table books
  add column if not exists loan_ledger jsonb not null default '[]'::jsonb;
