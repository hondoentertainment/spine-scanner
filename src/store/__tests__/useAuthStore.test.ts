import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../useAuthStore';

/* ================================================================
 *  Mock Supabase client
 * ================================================================
 *
 *  We mock `../lib/supabase` to provide a controllable fake client.
 *  Each test can configure what the auth methods return.
 */

const mockGetSession = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOtp = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));

vi.mock('../../lib/profiles', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  upsertProfile: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signUp: (creds: { email: string; password: string }) => mockSignUp(creds),
      signInWithPassword: (creds: { email: string; password: string }) => mockSignInWithPassword(creds),
      signInWithOtp: (opts: unknown) => mockSignInWithOtp(opts),
      signInWithOAuth: (opts: unknown) => mockSignInWithOAuth(opts),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: (...args: unknown[]) => void) => mockOnAuthStateChange(cb),
    },
  },
}));

const fakeUser = { id: 'user-1', email: 'test@example.com' };
const fakeSession = { user: fakeUser, access_token: 'tok' };

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      user: null,
      session: null,
      profile: null,
      loading: true,
      error: null,
      magicLinkSent: false,
    });

    vi.clearAllMocks();
  });

  /* ── initialize ──────────────────────────────────────────── */
  describe('initialize', () => {
    it('loads existing session on initialize', async () => {
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.user).toEqual(fakeUser);
      expect(state.session).toEqual(fakeSession);
      expect(state.loading).toBe(false);
    });

    it('sets user to null when no session exists', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('registers onAuthStateChange listener', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await useAuthStore.getState().initialize();

      expect(mockOnAuthStateChange).toHaveBeenCalledOnce();
    });

    it('handles getSession throwing gracefully', async () => {
      mockGetSession.mockRejectedValue(new Error('Network error'));

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  /* ── signUp ──────────────────────────────────────────────── */
  describe('signUp', () => {
    it('calls supabase.auth.signUp and clears loading on success', async () => {
      mockSignUp.mockResolvedValue({ data: { user: { id: 'user-123' }, session: null }, error: null });

      const userId = await useAuthStore.getState().signUp('test@test.com', 'password123');

      expect(mockSignUp).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' });
      expect(userId).toBe('user-123');
      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('returns userId on signUp success when username is provided', async () => {
      mockSignUp.mockResolvedValue({ data: { user: { id: 'user-456' }, session: null }, error: null });

      const userId = await useAuthStore.getState().signUp('test@test.com', 'password123', 'alice');

      expect(mockSignUp).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' });
      expect(userId).toBe('user-456');
    });

    it('sets error on signUp failure', async () => {
      mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Email already registered' } });

      const userId = await useAuthStore.getState().signUp('test@test.com', 'password123');

      expect(userId).toBeUndefined();
      const state = useAuthStore.getState();
      expect(state.error).toBe('Email already registered');
      expect(state.loading).toBe(false);
    });
  });

  /* ── signIn ──────────────────────────────────────────────── */
  describe('signIn', () => {
    it('sets user and session on successful sign-in', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: fakeSession, user: fakeUser },
        error: null,
      });

      await useAuthStore.getState().signIn('test@test.com', 'password123');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(fakeUser);
      expect(state.session).toEqual(fakeSession);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on sign-in failure', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials' },
      });

      await useAuthStore.getState().signIn('test@test.com', 'wrong');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid login credentials');
      expect(state.loading).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  /* ── signInWithMagicLink ────────────────────────────────── */
  describe('signInWithMagicLink', () => {
    it('calls supabase.auth.signInWithOtp and sets magicLinkSent on success', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: null });

      await useAuthStore.getState().signInWithMagicLink('test@test.com');

      expect(mockSignInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@test.com',
          options: expect.objectContaining({ emailRedirectTo: expect.any(String) }),
        })
      );
      const state = useAuthStore.getState();
      expect(state.magicLinkSent).toBe(true);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on signInWithOtp failure', async () => {
      mockSignInWithOtp.mockResolvedValue({ error: { message: 'Rate limit exceeded' } });

      await useAuthStore.getState().signInWithMagicLink('test@test.com');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Rate limit exceeded');
      expect(state.loading).toBe(false);
      expect(state.magicLinkSent).toBe(false);
    });

    it('sets loading true while in progress', async () => {
      let resolveOtp: (val: { error: null }) => void;
      mockSignInWithOtp.mockReturnValue(new Promise((r) => { resolveOtp = r; }));

      const promise = useAuthStore.getState().signInWithMagicLink('test@test.com');
      expect(useAuthStore.getState().loading).toBe(true);

      resolveOtp!({ error: null });
      await promise;
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  /* ── signInWithGoogle ────────────────────────────────────── */
  describe('signInWithGoogle', () => {
    it('calls supabase.auth.signInWithOAuth with google provider', async () => {
      mockSignInWithOAuth.mockResolvedValue({ error: null });

      await useAuthStore.getState().signInWithGoogle();

      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          options: expect.objectContaining({ redirectTo: expect.any(String) }),
        })
      );
    });

    it('sets error on signInWithOAuth failure', async () => {
      mockSignInWithOAuth.mockResolvedValue({ error: { message: 'OAuth failed' } });

      await useAuthStore.getState().signInWithGoogle();

      const state = useAuthStore.getState();
      expect(state.error).toBe('OAuth failed');
      expect(state.loading).toBe(false);
    });
  });

  /* ── signOut ─────────────────────────────────────────────── */
  describe('signOut', () => {
    it('clears user and session on successful sign-out', async () => {
      // Start signed in
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ user: fakeUser as any, session: fakeSession as any, loading: false });
      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().signOut();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('sets error on sign-out failure', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ user: fakeUser as any, session: fakeSession as any, loading: false });
      mockSignOut.mockResolvedValue({ error: { message: 'Sign out failed' } });

      await useAuthStore.getState().signOut();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Sign out failed');
      expect(state.loading).toBe(false);
    });
  });

  /* ── clearError ──────────────────────────────────────────── */
  describe('clearError', () => {
    it('clears the error state', () => {
      useAuthStore.setState({ error: 'Some error' });

      useAuthStore.getState().clearError();

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  /* ── clearMagicLinkSent ────────────────────────────────── */
  describe('clearMagicLinkSent', () => {
    it('resets magicLinkSent to false', () => {
      useAuthStore.setState({ magicLinkSent: true });

      useAuthStore.getState().clearMagicLinkSent();

      expect(useAuthStore.getState().magicLinkSent).toBe(false);
    });
  });
});
