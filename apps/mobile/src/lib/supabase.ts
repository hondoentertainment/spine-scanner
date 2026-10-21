import { createSpineSupabaseClient } from '@spine/shared';
import { sessionStorage } from './sessionStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Present only when both public env vars are set. The anon key is public by
 * design and must still stay out of git so each environment can supply its own.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createSpineSupabaseClient(supabaseUrl, supabaseAnonKey, {
        storage: sessionStorage,
        detectSessionInUrl: false,
      })
    : null;

export const isSupabaseConfigured = (): boolean => supabase !== null;
