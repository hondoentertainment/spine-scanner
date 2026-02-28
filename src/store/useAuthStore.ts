import { create } from 'zustand';
import { supabase } from '../lib/supabase.ts';
import { getProfile, upsertProfile } from '../lib/profiles.ts';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthProfile {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  preferences?: import('../types.ts').ProfilePreferences | null;
}

interface AuthStore {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<string | undefined>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  error: null,

  initialize: async () => {
    if (!supabase) {
      set({ loading: false });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user ?? null,
        loading: false,
      });
      if (session?.user?.id) {
        get().loadProfile();
      }

      // Listen for auth state changes (login, logout, token refresh)
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          profile: null,
        });
        if (session?.user?.id) {
          get().loadProfile();
        }
      });
    } catch {
      set({ loading: false });
    }
  },

  signUp: async (email: string, password: string, _username?: string): Promise<string | undefined> => {
    if (!supabase) return undefined;
    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      set({ error: error.message, loading: false });
      return undefined;
    }
    set({
      session: data.session,
      user: data.user,
      loading: false,
      error: null,
    });
    return data.user?.id;
  },

  signIn: async (email: string, password: string) => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
      });
      if (data.user?.id) {
        get().loadProfile();
      }
    }
  },

  signInWithGoogle: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '') || window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      set({ error: error.message, loading: false });
    }
    // On success, Supabase redirects to Google; after OAuth completes, user returns
    // to this app and onAuthStateChange (in initialize) picks up the new session.
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signOut();

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({ user: null, session: null, profile: null, loading: false, error: null });
    }
  },

  loadProfile: async () => {
    const user = get().user;
    if (!user?.id || !supabase) return;
    let p = await getProfile(user.id);
    // Auto-create/update profile for Google OAuth users from user_metadata
    const meta = user.user_metadata;
    const fromOAuth = meta?.avatar_url ?? meta?.full_name;
    if (fromOAuth && (!p || !p.displayName)) {
      await upsertProfile(user.id, {
        displayName: meta.full_name ?? null,
        avatarUrl: meta.avatar_url ?? null,
      });
      p = await getProfile(user.id);
    }
    set({
      profile: p
        ? { username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl, preferences: p.preferences ?? null }
        : null,
    });
  },

  clearError: () => set({ error: null }),
}));
