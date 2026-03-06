-- Add preferences JSONB column to profiles for user-specific settings.
-- Stores theme, library sort/view defaults, batch mode, etc.

alter table public.profiles add column if not exists preferences jsonb default '{}';

comment on column public.profiles.preferences is 'User preferences: theme, library sort, view mode, batch default, etc.';
