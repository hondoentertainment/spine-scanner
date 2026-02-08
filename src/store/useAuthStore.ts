import { create } from 'zustand';
import { supabase } from '../lib/supabase.ts';
import type { User, Session } from '@supabase/supabase-js';

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
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

      // Listen for auth state changes (login, logout, token refresh)
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });
      });
    } catch {
      set({ loading: false });
    }
  },

  signUp: async (email: string, password: string) => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({ loading: false, error: null });
    }
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
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signOut();

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({ user: null, session: null, loading: false, error: null });
    }
  },

  clearError: () => set({ error: null }),
}));
