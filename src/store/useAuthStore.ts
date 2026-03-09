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
  magicLinkSent: boolean;
  confirmationPending: boolean;
  recoveryMode: boolean;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<string | undefined>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  updatePassword: (newPassword: string) => Promise<boolean>;
  resendConfirmation: (email: string) => Promise<boolean>;
  clearError: () => void;
  clearMagicLinkSent: () => void;
  clearConfirmation: () => void;
}

function getRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '') || window.location.origin;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  error: null,
  magicLinkSent: false,
  confirmationPending: false,
  recoveryMode: false,

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

      supabase.auth.onAuthStateChange((event, session) => {
        const isRecovery = event === 'PASSWORD_RECOVERY';
        set({
          session,
          user: session?.user ?? null,
          profile: isRecovery ? get().profile : null,
          recoveryMode: isRecovery || get().recoveryMode,
        });

        if (event === 'SIGNED_IN' && session?.user?.id) {
          get().loadProfile();
        }
      });
    } catch {
      set({ loading: false });
    }
  },

  signUp: async (email: string, password: string, username?: string): Promise<string | undefined> => {
    if (!supabase) return undefined;
    set({ loading: true, error: null, confirmationPending: false });

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      set({ error: error.message, loading: false });
      return undefined;
    }

    // Supabase returns a user but no session when email confirmation is required
    if (data.user && !data.session) {
      // Save username to profile if provided (will be available after confirmation)
      if (username) {
        await upsertProfile(data.user.id, { username });
      }
      set({ confirmationPending: true, loading: false, error: null });
      return data.user.id;
    }

    // Session exists = email confirmation disabled or auto-confirmed
    if (data.user?.id && username) {
      await upsertProfile(data.user.id, { username });
    }
    set({
      session: data.session,
      user: data.user,
      loading: false,
      error: null,
    });
    if (data.user?.id) {
      get().loadProfile();
    }
    return data.user?.id;
  },

  signIn: async (email: string, password: string) => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message === 'Email not confirmed') {
        set({ error: 'Please check your email and confirm your account before signing in.', loading: false });
      } else {
        set({ error: error.message, loading: false });
      }
    } else {
      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
        confirmationPending: false,
      });
      if (data.user?.id) {
        get().loadProfile();
      }
    }
  },

  signInWithMagicLink: async (email: string) => {
    if (!supabase) return;
    set({ loading: true, error: null, magicLinkSent: false });

    const redirectTo = getRedirectUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({ loading: false, magicLinkSent: true });
    }
  },

  signInWithGoogle: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const redirectTo = getRedirectUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      set({ error: error.message, loading: false });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signOut();

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({ user: null, session: null, profile: null, loading: false, error: null, confirmationPending: false, recoveryMode: false });
    }
  },

  loadProfile: async () => {
    const user = get().user;
    if (!user?.id || !supabase) return;
    let p = await getProfile(user.id);
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

  resetPassword: async (email: string): Promise<boolean> => {
    if (!supabase) return false;
    set({ loading: true, error: null });

    const redirectTo = getRedirectUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      set({ error: error.message, loading: false });
      return false;
    }
    set({ loading: false });
    return true;
  },

  updatePassword: async (newPassword: string): Promise<boolean> => {
    if (!supabase) return false;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      set({ error: error.message, loading: false });
      return false;
    }
    set({ loading: false, recoveryMode: false });
    return true;
  },

  resendConfirmation: async (email: string): Promise<boolean> => {
    if (!supabase) return false;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.resend({ type: 'signup', email });

    if (error) {
      set({ error: error.message, loading: false });
      return false;
    }
    set({ loading: false });
    return true;
  },

  clearError: () => set({ error: null }),
  clearMagicLinkSent: () => set({ magicLinkSent: false }),
  clearConfirmation: () => set({ confirmationPending: false }),
}));
