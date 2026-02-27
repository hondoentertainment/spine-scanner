import { supabase } from './supabase.ts';

/**
 * Profiles table schema: see supabase/migrations/001_profiles.sql
 * Fields: id (=user_id), username, display_name, avatar_url, updated_at
 */

export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  updated_at?: string;
}

type ProfileUpdate = { username?: string; displayName?: string; avatarUrl?: string };

/**
 * Upsert a profile row for the given user. Creates or updates the profile.
 * Returns true on success, false on error.
 */
export async function upsertProfile(
  userId: string,
  data: ProfileUpdate
): Promise<boolean> {
  if (!supabase) return false;

  const row: Record<string, unknown> = {
    id: userId,
    updated_at: new Date().toISOString(),
  };
  if (data.username !== undefined) row.username = data.username || null;
  if (data.displayName !== undefined) row.display_name = data.displayName || null;
  if (data.avatarUrl !== undefined) row.avatar_url = data.avatarUrl || null;

  const { error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error('[profiles] Error upserting profile:', error.message);
    return false;
  }
  return true;
}

/**
 * Fetch the profile for a user. Returns null if not found or on error.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[profiles] Error fetching profile:', error.message);
    return null;
  }
  if (!data) return null;
  const row = data as { id: string; username?: string; display_name?: string; avatar_url?: string; updated_at?: string };
  return {
    id: row.id,
    username: row.username ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    updated_at: row.updated_at,
  };
}
