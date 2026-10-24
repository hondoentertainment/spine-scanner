import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import { getProfile, upsertProfile } from '../lib/profiles.ts';
import { e2eHooksEnabled, readE2EAuthSeed } from '../lib/e2eHooks.ts';
import {
  consumeAuthReturn,
  consumeOAuthCallback,
  currentAppPath,
  friendlyAuthError,
  getOAuthRedirectUrl,
  rememberAuthReturn,
  redirectBrowser,
  stripOAuthParams,
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
  /** App path to restore after the OAuth redirect, relative to the router basename. */
  authReturnPath: string | null;
  clearError: () => void;
  clearMagicLinkSent: () => void;
  clearConfirmation: () => void;
}

let stopAuthListener: (() => void) | null = null;
let authInFlight = false;

function beginAuth(): boolean {
  if (authInFlight) return false;
  authInFlight = true;
  return true;
}

function endAuth(): void {
  authInFlight = false;
}

function clearedSession() {
  return {
    user: null,
    session: null,
    profile: null,
    loading: false,
    error: null as string | null,
    magicLinkSent: false,
    confirmationPending: false,
    recoveryMode: false,
    pendingCloudLink: false,
    authReturnPath: null as string | null,
  };
}

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
  authReturnPath: null,

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

    const href = typeof window !== 'undefined' ? window.location.href : '';
    const callback = href ? consumeOAuthCallback(href) : null;
    const callbackError = callback?.error?.message ?? null;
    const returnPath = callback ? consumeAuthReturn() : null;

    if (callback && typeof window !== 'undefined') {
      const next = stripOAuthParams(window.location.href);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) {
        window.history.replaceState(window.history.state, '', next);
      }
    }
    if (callbackError) {
      set({ error: callbackError, loading: false, authReturnPath: returnPath });
    }

    try {
      const { data: { session: restored } } = await supabase.auth.getSession();
      let session = restored;
      let exchangeError: string | null = null;

      if (callback?.code && !session && !callback.error) {
        const exchanged = await supabase.auth.exchangeCodeForSession(callback.code);
        if (exchanged.error) {
          exchangeError = friendlyAuthError(exchanged.error.message);
        } else {
          session = exchanged.data.session;
        }
      } else if (callback?.accessToken && callback.refreshToken && !session && !callback.error) {
        const fromHash = await supabase.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (fromHash.error) {
          exchangeError = friendlyAuthError(fromHash.error.message);
        } else {
          session = fromHash.data.session;
        }
      }

      const freshSignIn = Boolean(session && callback && (callback.code || callback.accessToken));
      set({
        session,
        user: session?.user ?? null,
        loading: false,
        pendingCloudLink: freshSignIn,
        error: callbackError ?? exchangeError ?? get().error,
        ...(returnPath ? { authReturnPath: returnPath } : {}),
      });
      if (session?.user?.id) {
        get().loadProfile();
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'SIGNED_OUT') {
          set({
            ...clearedSession(),
            error: get().error,
          });
          return;
        }
        const isRecovery = event === 'PASSWORD_RECOVERY';
        set({
          session: nextSession,
          user: nextSession?.user ?? null,
          profile: isRecovery ? get().profile : null,
          recoveryMode: isRecovery || get().recoveryMode,
          pendingCloudLink: event === 'SIGNED_IN' ? true : get().pendingCloudLink,
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
    } catch (err) {
      const fallback = err instanceof Error ? friendlyAuthError(err.message) : null;
      set({
        loading: false,
        error: callbackError ?? fallback ?? get().error,
        ...(returnPath ? { authReturnPath: returnPath } : {}),
      });
    }
  },

  signUp: async (email: string, password: string, username?: string): Promise<string | undefined> => {
    if (!supabase || !beginAuth()) return undefined;
    set({ loading: true, error: null, confirmationPending: false });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        set({ error: friendlyAuthError(error.message), loading: false });
        return undefined;
      }

      // Supabase returns a user but no session when email confirmation is required
      if (data.user && !data.session) {
        if (username) {
          await upsertProfile(data.user.id, { username });
        }
        set({ confirmationPending: true, loading: false, error: null });
        return data.user.id;
      }

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
    } catch (err) {
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Could not create the account.'), loading: false });
      return undefined;
    } finally {
      endAuth();
    }
  },

  signIn: async (email: string, password: string) => {
    if (!supabase || !beginAuth()) return;
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        set({ error: friendlyAuthError(error.message), loading: false });
        return;
      }
      set({
        session: data.session,
        user: data.user,
        loading: false,
        error: null,
        confirmationPending: false,
        magicLinkSent: false,
        pendingCloudLink: true,
      });
      if (data.user?.id) {
        get().loadProfile();
      }
    } catch (err) {
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Sign-in failed.'), loading: false });
    } finally {
      endAuth();
    }
  },

  signInWithMagicLink: async (email: string) => {
    if (!supabase || !beginAuth()) return;
    set({ loading: true, error: null, magicLinkSent: false });
    const returnPath = typeof window !== 'undefined' ? currentAppPath() : '/';
    rememberAuthReturn(returnPath);
    const redirectTo = getOAuthRedirectUrl(returnPath);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        consumeAuthReturn();
        set({ error: friendlyAuthError(error.message), loading: false });
      } else {
        set({ loading: false, magicLinkSent: true });
      }
    } catch (err) {
      consumeAuthReturn();
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Could not send the sign-in link.'), loading: false });
    } finally {
      endAuth();
    }
  },

  signInWithGoogle: async () => {
    if (!supabase) {
      set({ error: 'Google sign-in is not set up for this install.', loading: false });
      return;
    }
    if (!beginAuth()) return;
    set({ loading: true, error: null });

    const returnPath = typeof window !== 'undefined' ? currentAppPath() : '/';
    rememberAuthReturn(returnPath);
    const redirectTo = getOAuthRedirectUrl(returnPath);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });

      if (error) {
        consumeAuthReturn();
        set({ error: friendlyAuthError(error.message), loading: false });
        return;
      }
      if (!data?.url) {
        consumeAuthReturn();
        set({ error: 'Google did not return a sign-in link. Try again.', loading: false });
        return;
      }

      try {
        redirectBrowser(data.url);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        // jsdom refuses navigation. A real browser leaves this page with the PKCE verifier stored.
        if (/not implemented/i.test(message)) return;
        consumeAuthReturn();
        set({ error: 'Could not open Google sign-in. Try again.', loading: false });
      }
    } catch (err) {
      consumeAuthReturn();
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Could not open Google sign-in. Try again.'), loading: false });
    } finally {
      endAuth();
    }
  },

  signOut: async () => {
    if (!supabase || !beginAuth()) return;
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
      consumeAuthReturn();
      set({
        ...clearedSession(),
        error: error ? friendlyAuthError(error.message) : null,
      });
    } catch (err) {
      consumeAuthReturn();
      set({
        ...clearedSession(),
        error: friendlyAuthError(err instanceof Error ? err.message : 'Signed out on this device.'),
      });
    } finally {
      endAuth();
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
    if (!supabase || !beginAuth()) return false;
    set({ loading: true, error: null });
    const returnPath = typeof window !== 'undefined' ? currentAppPath() : '/';
    rememberAuthReturn(returnPath);
    const redirectTo = getOAuthRedirectUrl(returnPath);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        set({ error: friendlyAuthError(error.message), loading: false });
        return false;
      }
      set({ loading: false });
      return true;
    } catch (err) {
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Could not send the reset link.'), loading: false });
      return false;
    } finally {
      endAuth();
    }
  },

  updatePassword: async (newPassword: string): Promise<boolean> => {
    if (!supabase || !beginAuth()) return false;
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        set({ error: friendlyAuthError(error.message), loading: false });
        return false;
      }
      set({ loading: false, recoveryMode: false });
      return true;
    } catch (err) {
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Could not update the password.'), loading: false });
      return false;
    } finally {
      endAuth();
    }
  },

  resendConfirmation: async (email: string): Promise<boolean> => {
    if (!supabase || !beginAuth()) return false;
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) {
        set({ error: friendlyAuthError(error.message), loading: false });
        return false;
      }
      set({ loading: false });
      return true;
    } catch (err) {
      set({ error: friendlyAuthError(err instanceof Error ? err.message : 'Could not resend the email.'), loading: false });
      return false;
    } finally {
      endAuth();
    }
  },

  clearError: () => set({ error: null }),
  clearMagicLinkSent: () => set({ magicLinkSent: false }),
  clearConfirmation: () => set({ confirmationPending: false }),
}));
