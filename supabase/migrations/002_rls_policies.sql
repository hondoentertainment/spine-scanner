-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Row-Level Security (RLS) policies
-- Each user can only access their own rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── books RLS ─────────────────────────────────────────────────────────────────
alter table public.books enable row level security;

drop policy if exists "users can select own books"  on public.books;
drop policy if exists "users can insert own books"  on public.books;
drop policy if exists "users can update own books"  on public.books;
drop policy if exists "users can delete own books"  on public.books;

create policy "users can select own books"
  on public.books for select
  using (auth.uid() = user_id);

create policy "users can insert own books"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "users can update own books"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own books"
  on public.books for delete
  using (auth.uid() = user_id);

-- ── shelves RLS ───────────────────────────────────────────────────────────────
alter table public.shelves enable row level security;

drop policy if exists "users can select own shelves"  on public.shelves;
drop policy if exists "users can insert own shelves"  on public.shelves;
drop policy if exists "users can update own shelves"  on public.shelves;
drop policy if exists "users can delete own shelves"  on public.shelves;

create policy "users can select own shelves"
  on public.shelves for select
  using (auth.uid() = user_id);

create policy "users can insert own shelves"
  on public.shelves for insert
  with check (auth.uid() = user_id);

create policy "users can update own shelves"
  on public.shelves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own shelves"
  on public.shelves for delete
  using (auth.uid() = user_id);

-- ── profiles RLS ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "users can select own profile"  on public.profiles;
drop policy if exists "users can insert own profile"  on public.profiles;
drop policy if exists "users can update own profile"  on public.profiles;

create policy "users can select own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
