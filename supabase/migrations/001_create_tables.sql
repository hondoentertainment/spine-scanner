-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: Create core tables
-- Run with: supabase db push  OR  execute in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── books ─────────────────────────────────────────────────────────────────────
create table if not exists public.books (
  id           text        primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  isbn         text        not null default '',
  title        text        not null default 'Unknown Title',
  author       text        not null default 'Unknown Author',
  page_count   integer     not null default 0,
  amazon_link  text        not null default '',
  cover_img    text        not null default '',
  status       text        not null default 'to-read'
                           check (status in ('to-read', 'reading', 'read', 'dnf')),
  notes        text        not null default '',
  date_added   timestamptz not null default now(),
  shelf_ids    text[]      not null default '{}',
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz          default null
);

-- ── shelves ───────────────────────────────────────────────────────────────────
create table if not exists public.shelves (
  id       text    primary key,
  user_id  uuid    not null references auth.users(id) on delete cascade,
  name     text    not null,
  color    text    not null default '#6366f1'
);

-- ── profiles (optional preferences sync) ─────────────────────────────────────
create table if not exists public.profiles (
  user_id     uuid    primary key references auth.users(id) on delete cascade,
  preferences jsonb   not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
