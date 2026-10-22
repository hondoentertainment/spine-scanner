-- Base books and shelves tables for cloud sync.
-- This is the schema the README SQL editor snippet created, before
-- migrations 004–008 add review, metadata, loan, and location columns.
-- Safe to re-run: production already has these tables and policies.

create table if not exists public.books (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  isbn text not null default '',
  title text not null default '',
  author text not null default '',
  page_count integer not null default 0,
  amazon_link text not null default '',
  cover_img text not null default '',
  status text not null default 'to-read',
  notes text not null default '',
  date_added text not null default '',
  shelf_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.shelves (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default '',
  color text not null default '#6366f1'
);

-- FK columns are not indexed by default. Sync and RLS filter on user_id.
create index if not exists books_user_id_idx on public.books (user_id);
create index if not exists shelves_user_id_idx on public.shelves (user_id);

alter table public.books enable row level security;
alter table public.shelves enable row level security;

-- CREATE POLICY has no IF NOT EXISTS. Skip policies that production already has.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'books'
      and policyname = 'Users can view their own books'
  ) then
    create policy "Users can view their own books"
      on public.books for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'books'
      and policyname = 'Users can insert their own books'
  ) then
    create policy "Users can insert their own books"
      on public.books for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'books'
      and policyname = 'Users can update their own books'
  ) then
    create policy "Users can update their own books"
      on public.books for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'books'
      and policyname = 'Users can delete their own books'
  ) then
    create policy "Users can delete their own books"
      on public.books for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shelves'
      and policyname = 'Users can view their own shelves'
  ) then
    create policy "Users can view their own shelves"
      on public.shelves for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shelves'
      and policyname = 'Users can insert their own shelves'
  ) then
    create policy "Users can insert their own shelves"
      on public.shelves for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shelves'
      and policyname = 'Users can update their own shelves'
  ) then
    create policy "Users can update their own shelves"
      on public.shelves for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shelves'
      and policyname = 'Users can delete their own shelves'
  ) then
    create policy "Users can delete their own shelves"
      on public.shelves for delete
      using (auth.uid() = user_id);
  end if;
end $$;
