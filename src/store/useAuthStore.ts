import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import { getProfile, upsertProfile } from '../lib/profiles.ts';
import { e2eHooksEnabled, readE2EAuthSeed } from '../lib/e2eHooks.ts';
import {
  getOAuthRedirectUrl,
  hasOAuthCode,
  readOAuthReturnError,
  redirectBrowser,
  stripOAuthErrorParams,
} from '../lib/googleAuth.ts';

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
  /** True after a new sign-in (not a restored session) so the app can offer a merge. */
  pendingCloudLink: boolean;
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

let stopAuthListener: (() => void) | null = null;

function seededUser(seed: { id?: string; email: string; name: string; avatarUrl?: string }): User {
  return {
    id: seed.id || 'e2e-user',
    email: seed.email,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {
      full_name: seed.name,
      avatar_url: seed.avatarUrl ?? '',
    },
    created_at: '2024-03-01T00:00:00.000Z',
  } as User;
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
  pendingCloudLink: false,

  initialize: async () => {
    stopAuthListener?.();
    stopAuthListener = null;

    if (e2eHooksEnabled()) {
      const seed = readE2EAuthSeed(true);
      if (seed) {
        const user = seededUser(seed);
        set({
          user,
          session: { user, access_token: 'e2e-token' } as Session,
          profile: {
            username: null,
            displayName: seed.name,
            avatarUrl: seed.avatarUrl ?? null,
          },
          loading: false,
          error: null,
          pendingCloudLink: false,
        });
        return;
      }
    }

    if (!supabase) {
      set({ loading: false });
      return;
    }

    const oauthError = typeof window !== 'undefined' ? readOAuthReturnError(window.location.search) : null;
    if (oauthError && typeof window !== 'undefined') {
      const next = stripOAuthErrorParams(window.location.href);
      window.history.replaceState(window.history.state, '', next);
      set({ error: oauthError.message, loading: false });
    }

    try {
      const hadCode = typeof window !== 'undefined' && hasOAuthCode(window.location.search);
      const { data: { session } } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        pendingCloudLink: Boolean(session && hadCode),
      });
      if (session?.user?.id) {
        get().loadProfile();
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        const isRecovery = event === 'PASSWORD_RECOVERY';
        set({
          session: nextSession,
          user: nextSession?.user ?? null,
          profile: isRecovery ? get().profile : null,
          recoveryMode: isRecovery || get().recoveryMode,
          pendingCloudLink: event === 'SIGNED_IN'
            ? true
            : event === 'SIGNED_OUT'
              ? false
              : get().pendingCloudLink,
          loading: false,
        });

        if (event === 'SIGNED_IN' && nextSession?.user?.id) {
          get().loadProfile();
        }
      });

      const onResume = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const client = supabase;
        if (!client) return;
        void client.auth.getSession().then(({ data }) => {
          const next = data.session;
          if (!next?.user || next.user.id === get().user?.id) return;
          set({
            session: next,
            user: next.user,
            loading: false,
            pendingCloudLink: true,
          });
          void get().loadProfile();
        }).catch(() => undefined);
      };
      document.addEventListener('visibilitychange', onResume);
      const onPageShow = (event: PageTransitionEvent) => {
        if (event.persisted) onResume();
      };
      window.addEventListener('pageshow', onPageShow);
      stopAuthListener = () => {
        subscription.unsubscribe();
        document.removeEventListener('visibilitychange', onResume);
        window.removeEventListener('pageshow', onPageShow);
      };
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
      pendingCloudLink: true,
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
        pendingCloudLink: true,
      });
      if (data.user?.id) {
        get().loadProfile();
      }
    }
  },

  signInWithMagicLink: async (email: string) => {
    if (!supabase) return;
    set({ loading: true, error: null, magicLinkSent: false });

    const redirectTo = getOAuthRedirectUrl();
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
    if (!supabase) {
      set({ error: 'Google sign-in is not set up for this install.', loading: false });
      return;
    }
    set({ loading: true, error: null });

    const redirectTo = getOAuthRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) {
      set({ error: error.message, loading: false });
      return;
    }
    if (!data?.url) {
      set({ error: 'Google did not return a sign-in link. Try again.', loading: false });
      return;
    }

    try {
      redirectBrowser(data.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // jsdom refuses navigation. A real browser leaves this page with the PKCE verifier stored.
      if (/not implemented/i.test(message)) return;
      set({ error: 'Could not open Google sign-in. Try again.', loading: false });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signOut();

    if (error) {
      set({ error: error.message, loading: false });
    } else {
      set({
        user: null,
        session: null,
        profile: null,
        loading: false,
        error: null,
        confirmationPending: false,
        recoveryMode: false,
        pendingCloudLink: false,
      });
    }
  },

  loadProfile: async () => {
    const user = get().user;
    if (!user?.id || !supabase) return;
    let p = await getProfile(user.id);
    const meta = user.user_metadata as { avatar_url?: string; picture?: string; full_name?: string; name?: string };
    const avatarUrl = meta?.avatar_url ?? meta?.picture ?? null;
    const displayName = meta?.full_name ?? meta?.name ?? null;
    if ((avatarUrl || displayName) && (!p?.displayName || !p?.avatarUrl)) {
      await upsertProfile(user.id, {
        displayName: p?.displayName || displayName || undefined,
        avatarUrl: p?.avatarUrl || avatarUrl || undefined,
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

    const redirectTo = getOAuthRedirectUrl();
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
