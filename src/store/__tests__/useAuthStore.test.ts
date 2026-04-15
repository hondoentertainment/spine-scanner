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
const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();
const mockResend = vi.fn();

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
      resetPasswordForEmail: (email: string, opts: unknown) => mockResetPasswordForEmail(email, opts),
      updateUser: (data: unknown) => mockUpdateUser(data),
      resend: (opts: unknown) => mockResend(opts),
    },
  },
}));

const fakeUser = { id: 'user-1', email: 'test@example.com', user_metadata: {} };
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
      confirmationPending: false,
      recoveryMode: false,
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

    it('fires onAuthStateChange with PASSWORD_RECOVERY event and sets recoveryMode', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      let capturedCb: (event: string, session: unknown) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb) => {
        capturedCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      await useAuthStore.getState().initialize();

      // Simulate PASSWORD_RECOVERY event
      capturedCb('PASSWORD_RECOVERY', fakeSession);

      const state = useAuthStore.getState();
      expect(state.recoveryMode).toBe(true);
      // profile should be preserved (not cleared) during recovery
    });

    it('fires onAuthStateChange with SIGNED_IN event and loads profile', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      let capturedCb: (event: string, session: unknown) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb) => {
        capturedCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      await useAuthStore.getState().initialize();

      // Simulate SIGNED_IN event
      capturedCb('SIGNED_IN', fakeSession);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(fakeUser);
    });

    it('fires onAuthStateChange with SIGNED_OUT event and clears user', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });

      let capturedCb: (event: string, session: unknown) => void = () => {};
      mockOnAuthStateChange.mockImplementation((cb) => {
        capturedCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      await useAuthStore.getState().initialize();

      capturedCb('SIGNED_OUT', null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
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

    it('sets session when signUp returns user and session (auto-confirmed)', async () => {
      const sessionUser = { id: 'user-789', email: 'a@b.com', user_metadata: {} };
      const sessionData = { user: sessionUser, access_token: 'tok2' };
      mockSignUp.mockResolvedValue({ data: { user: sessionUser, session: sessionData }, error: null });

      const userId = await useAuthStore.getState().signUp('a@b.com', 'pass1234');

      const state = useAuthStore.getState();
      expect(userId).toBe('user-789');
      expect(state.session).toEqual(sessionData);
      expect(state.confirmationPending).toBe(false);
    });

    it('sets session when signUp with username returns user and session', async () => {
      const sessionUser = { id: 'user-890', email: 'a@b.com', user_metadata: {} };
      const sessionData = { user: sessionUser, access_token: 'tok3' };
      mockSignUp.mockResolvedValue({ data: { user: sessionUser, session: sessionData }, error: null });

      const userId = await useAuthStore.getState().signUp('a@b.com', 'pass1234', 'bob');

      expect(userId).toBe('user-890');
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

    it('sets a friendly message when email is not confirmed', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed' },
      });

      await useAuthStore.getState().signIn('test@test.com', 'password');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Please check your email and confirm your account before signing in.');
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

    it('clears recoveryMode on successful sign-out', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ user: fakeUser as any, session: fakeSession as any, loading: false, recoveryMode: true });
      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().signOut();

      expect(useAuthStore.getState().recoveryMode).toBe(false);
    });
  });

  /* ── loadProfile ─────────────────────────────────────────── */
  describe('loadProfile', () => {
    it('does nothing when no user is set', async () => {
      useAuthStore.setState({ user: null });
      // Should not throw
      await useAuthStore.getState().loadProfile();
      expect(useAuthStore.getState().profile).toBeNull();
    });

    it('sets profile when getProfile returns data', async () => {
      const { getProfile } = await import('../../lib/profiles');
      vi.mocked(getProfile).mockResolvedValue({
        username: 'alice',
        displayName: 'Alice Smith',
        avatarUrl: 'https://example.com/avatar.jpg',
        preferences: null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ user: fakeUser as any });

      await useAuthStore.getState().loadProfile();

      const state = useAuthStore.getState();
      expect(state.profile?.username).toBe('alice');
      expect(state.profile?.displayName).toBe('Alice Smith');
    });

    it('upserts OAuth metadata when user has avatar_url', async () => {
      const { getProfile, upsertProfile } = await import('../../lib/profiles');
      vi.mocked(getProfile).mockResolvedValue(null);
      vi.mocked(upsertProfile).mockResolvedValue(true);

      const oauthUser = {
        id: 'oauth-1', email: 'o@a.com',
        user_metadata: { avatar_url: 'https://avatar.url', full_name: 'OAuth User' },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ user: oauthUser as any });

      await useAuthStore.getState().loadProfile();

      expect(upsertProfile).toHaveBeenCalledWith('oauth-1', {
        displayName: 'OAuth User',
        avatarUrl: 'https://avatar.url',
      });
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

  /* ── clearConfirmation ─────────────────────────────────── */
  describe('clearConfirmation', () => {
    it('resets confirmationPending to false', () => {
      useAuthStore.setState({ confirmationPending: true });

      useAuthStore.getState().clearConfirmation();

      expect(useAuthStore.getState().confirmationPending).toBe(false);
    });
  });

  /* ── resetPassword ─────────────────────────────────────── */
  describe('resetPassword', () => {
    it('calls supabase.auth.resetPasswordForEmail and returns true on success', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      const ok = await useAuthStore.getState().resetPassword('test@test.com');

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@test.com', expect.objectContaining({ redirectTo: expect.any(String) }));
      expect(ok).toBe(true);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('sets error and returns false on failure', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });

      const ok = await useAuthStore.getState().resetPassword('bad@test.com');

      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('User not found');
    });
  });

  /* ── updatePassword ────────────────────────────────────── */
  describe('updatePassword', () => {
    it('calls supabase.auth.updateUser and clears recoveryMode on success', async () => {
      useAuthStore.setState({ recoveryMode: true, loading: false });
      mockUpdateUser.mockResolvedValue({ error: null });

      const ok = await useAuthStore.getState().updatePassword('newpass123');

      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass123' });
      expect(ok).toBe(true);
      expect(useAuthStore.getState().recoveryMode).toBe(false);
    });

    it('sets error on failure', async () => {
      mockUpdateUser.mockResolvedValue({ error: { message: 'Weak password' } });

      const ok = await useAuthStore.getState().updatePassword('123');

      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('Weak password');
    });
  });

  /* ── resendConfirmation ────────────────────────────────── */
  describe('resendConfirmation', () => {
    it('calls supabase.auth.resend and returns true on success', async () => {
      mockResend.mockResolvedValue({ error: null });

      const ok = await useAuthStore.getState().resendConfirmation('test@test.com');

      expect(mockResend).toHaveBeenCalledWith({ type: 'signup', email: 'test@test.com' });
      expect(ok).toBe(true);
    });

    it('sets error on failure', async () => {
      mockResend.mockResolvedValue({ error: { message: 'Rate limited' } });

      const ok = await useAuthStore.getState().resendConfirmation('test@test.com');

      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('Rate limited');
    });
  });

  /* ── confirmationPending ───────────────────────────────── */
  describe('confirmationPending', () => {
    it('sets confirmationPending when signUp returns user without session', async () => {
      mockSignUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });

      await useAuthStore.getState().signUp('test@test.com', 'pass1234');

      expect(useAuthStore.getState().confirmationPending).toBe(true);
    });
  });
});

