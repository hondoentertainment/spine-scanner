import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase client — only initialized when env vars are present.
 * The app works fully offline with localStorage when Supabase is not configured.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/** Returns true when the app has a valid Supabase configuration */
export const isSupabaseConfigured = (): boolean => supabase !== null;
