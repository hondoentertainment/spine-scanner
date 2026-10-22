import { create } from 'zustand';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

export interface MobileAuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  confirmationPending: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearError: () => void;
}

/**
 * Email/password session store for the iOS app.
 * Google OAuth stays in the app shell because it needs the system browser.
 * The web auth store is still separate: it owns the PWA redirect, e2e seed, and visibility listeners.
 */
export function createAuthStore(getClient: () => SupabaseClient | null) {
  let unsubscribe: (() => void) | null = null;

  return create<MobileAuthState>((set) => ({
    user: null,
    session: null,
    loading: true,
    error: null,
    confirmationPending: false,
    clearError: () => set({ error: null }),
    setSession: (session) => set({
      session,
      user: session?.user ?? null,
      loading: false,
      error: null,
    }),
    initialize: async () => {
      unsubscribe?.();
      unsubscribe = null;
      const client = getClient();
      if (!client) {
        set({ loading: false, user: null, session: null });
        return;
      }
      const { data, error } = await client.auth.getSession();
      if (error) {
        set({ loading: false, error: error.message });
      } else {
        set({
          loading: false,
          session: data.session,
          user: data.session?.user ?? null,
          error: null,
        });
      }
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          set({
            session: null,
            user: null,
            loading: false,
            confirmationPending: false,
          });
          return;
        }
        set({
          session,
          user: session?.user ?? null,
          loading: false,
        });
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    },
    signIn: async (email, password) => {
      const client = getClient();
      if (!client) {
        set({ error: 'Cloud sign-in is not set up for this install.', loading: false });
        return false;
      }
      set({ loading: true, error: null });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        set({
          error: error.message === 'Email not confirmed'
            ? 'Please check your email and confirm your account before signing in.'
            : error.message,
          loading: false,
        });
        return false;
      }
      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
        confirmationPending: false,
      });
      return true;
    },
    signUp: async (email, password) => {
      const client = getClient();
      if (!client) {
        set({ error: 'Cloud sign-in is not set up for this install.', loading: false });
        return false;
      }
      set({ loading: true, error: null, confirmationPending: false });
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) {
        set({ error: error.message, loading: false });
        return false;
      }
      if (data.user && !data.session) {
        set({ confirmationPending: true, loading: false, error: null });
        return true;
      }
      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
      });
      return true;
    },
    signOut: async () => {
      const client = getClient();
      if (!client) return;
      set({ loading: true, error: null });
      const { error } = await client.auth.signOut();
      if (error) {
        set({ error: error.message, loading: false });
        return;
      }
      set({
        user: null,
        session: null,
        loading: false,
        error: null,
        confirmationPending: false,
      });
    },
  }));
}
