create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shelves (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.shelves enable row level security;

create policy "Profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Books are readable by owner"
  on public.books for select
  using (auth.uid() = user_id);

create policy "Books are insertable by owner"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "Books are updatable by owner"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Books are deletable by owner"
  on public.books for delete
  using (auth.uid() = user_id);

create policy "Shelves are readable by owner"
  on public.shelves for select
  using (auth.uid() = user_id);

create policy "Shelves are insertable by owner"
  on public.shelves for insert
  with check (auth.uid() = user_id);

create policy "Shelves are updatable by owner"
  on public.shelves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Shelves are deletable by owner"
  on public.shelves for delete
  using (auth.uid() = user_id);

create index if not exists books_user_id_idx on public.books(user_id);
create index if not exists shelves_user_id_idx on public.shelves(user_id);
