import { create } from 'zustand';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { emailAddressProblem, friendlyAuthError } from './authMessages';

export interface CreateAuthStoreOptions {
  /**
   * Called when the signed-in user id changes, including sign-out (null).
   * The phone library uses this to park the previous account's books.
   */
  onAccountChange?: (userId: string | null) => void;
}

export interface MobileAuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  confirmationPending: boolean;
  /** True after a magic link email was accepted. The session arrives on the callback. */
  magicLinkSent: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  /**
   * Email a sign-in link. `redirectTo` must be the allow-listed app callback
   * (`spinescanner://auth/callback` on a development or store build).
   */
  signInWithMagicLink: (email: string, redirectTo: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearError: () => void;
  clearMagicLinkSent: () => void;
}

/**
 * Email/password and magic-link session store for the iOS app.
 * Google OAuth stays in the app shell because it needs the system browser.
 * The web auth store is still separate: it owns the PWA redirect, e2e seed, and visibility listeners.
 */
export function createAuthStore(
  getClient: () => SupabaseClient | null,
  options: CreateAuthStoreOptions = {},
) {
  let unsubscribe: (() => void) | null = null;
  let publishedUserId: string | null = null;

  function publishUser(userId: string | null): void {
    if (publishedUserId === userId) return;
    publishedUserId = userId;
    options.onAccountChange?.(userId);
  }

  return create<MobileAuthState>((set) => ({
    user: null,
    session: null,
    loading: true,
    error: null,
    confirmationPending: false,
    magicLinkSent: false,
    clearError: () => set({ error: null }),
    clearMagicLinkSent: () => set({ magicLinkSent: false }),
    setSession: (session) => {
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        error: null,
      });
      publishUser(session?.user?.id ?? null);
    },
    initialize: async () => {
      unsubscribe?.();
      unsubscribe = null;
      const client = getClient();
      if (!client) {
        set({ loading: false, user: null, session: null });
        publishUser(null);
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
        publishUser(data.session?.user?.id ?? null);
      }
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          set({
            session: null,
            user: null,
            loading: false,
            confirmationPending: false,
            magicLinkSent: false,
          });
          publishUser(null);
          return;
        }
        set({
          session,
          user: session?.user ?? null,
          loading: false,
        });
        publishUser(session?.user?.id ?? null);
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
        magicLinkSent: false,
      });
      publishUser(data.user?.id ?? null);
      return true;
    },
    signInWithMagicLink: async (email, redirectTo) => {
      const client = getClient();
      if (!client) {
        set({ error: 'Cloud sign-in is not set up for this install.', loading: false, magicLinkSent: false });
        return false;
      }
      const problem = emailAddressProblem(email);
      if (problem) {
        set({ error: problem, loading: false, magicLinkSent: false });
        return false;
      }
      set({ loading: true, error: null, magicLinkSent: false });
      try {
        const { error } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: redirectTo },
        });
        if (error) {
          set({ error: friendlyAuthError(error.message), loading: false, magicLinkSent: false });
          return false;
        }
        set({ loading: false, error: null, magicLinkSent: true });
        return true;
      } catch (err) {
        set({
          error: friendlyAuthError(err instanceof Error ? err.message : 'Could not send the sign-in link.'),
          loading: false,
          magicLinkSent: false,
        });
        return false;
      }
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
      publishUser(data.user?.id ?? null);
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
        magicLinkSent: false,
      });
      publishUser(null);
    },
  }));
}
