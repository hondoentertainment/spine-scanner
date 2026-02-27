-- Add display_name and avatar_url for Google OAuth users.
-- Safe to run if 001_profiles already had these columns (IF NOT EXISTS).

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
