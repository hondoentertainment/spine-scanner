-- Profiles table for authenticated members
-- Run this in the Supabase SQL Editor to create the profiles table.
-- See README Cloud Sync Setup for books/shelves tables.

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  unique(user_id)
);

-- Row Level Security: users can only access their own profile
alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = user_id);

-- Optional: auto-create profile on signup (run if you want server-side trigger)
-- create or replace function public.handle_new_user()
-- returns trigger as $$
-- begin
--   insert into public.profiles (user_id)
--   values (new.id);
--   return new;
-- end;
-- $$ language plpgsql security definer;
--
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute function public.handle_new_user();
