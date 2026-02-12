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
const mockSignOut = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signUp: (creds: any) => mockSignUp(creds),
      signInWithPassword: (creds: any) => mockSignInWithPassword(creds),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: any) => mockOnAuthStateChange(cb),
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
      loading: true,
      error: null,
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
      mockSignUp.mockResolvedValue({ error: null });

      await useAuthStore.getState().signUp('test@test.com', 'password123');

      expect(mockSignUp).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' });
      const state = useAuthStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on signUp failure', async () => {
      mockSignUp.mockResolvedValue({ error: { message: 'Email already registered' } });

      await useAuthStore.getState().signUp('test@test.com', 'password123');

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

  /* ── signOut ─────────────────────────────────────────────── */
  describe('signOut', () => {
    it('clears user and session on successful sign-out', async () => {
      // Start signed in
      useAuthStore.setState({ user: fakeUser as any, session: fakeSession as any, loading: false });
      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().signOut();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('sets error on sign-out failure', async () => {
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
});
