import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../useAuthStore';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
let authStateCallback: ((...args: unknown[]) => void) | null = null;
const mockOnAuthStateChange = vi.fn((cb: (...args: unknown[]) => void) => {
  authStateCallback = cb;
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});

vi.mock('../../lib/profiles', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  upsertProfile: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signUp: (creds: unknown) => mockSignUp(creds),
      signInWithPassword: (creds: unknown) => mockSignInWithPassword(creds),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: (...args: unknown[]) => void) => mockOnAuthStateChange(cb),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const fakeUser = { id: 'user-1', email: 'test@example.com', user_metadata: {} };
const fakeSession = { user: fakeUser, access_token: 'tok' };

describe('useAuthStore — edge cases', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null, session: null, profile: null, loading: true,
      error: null, magicLinkSent: false, confirmationPending: false, recoveryMode: false,
    });
    authStateCallback = null;
    vi.clearAllMocks();
  });

  // ── onAuthStateChange: PASSWORD_RECOVERY ──────────────────────────────────

  describe('onAuthStateChange — PASSWORD_RECOVERY', () => {
    it('sets recoveryMode to true when PASSWORD_RECOVERY event fires', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await useAuthStore.getState().initialize();

      expect(authStateCallback).not.toBeNull();
      authStateCallback!('PASSWORD_RECOVERY', { user: fakeUser, access_token: 'rec-tok' });

      expect(useAuthStore.getState().recoveryMode).toBe(true);
    });

    it('preserves existing profile during PASSWORD_RECOVERY', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await useAuthStore.getState().initialize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ profile: { username: 'alice', displayName: null, avatarUrl: null } as any });

      authStateCallback!('PASSWORD_RECOVERY', { user: fakeUser, access_token: 'rec-tok' });

      expect(useAuthStore.getState().profile?.username).toBe('alice');
    });
  });

  // ── onAuthStateChange: SIGNED_IN ──────────────────────────────────────────

  describe('onAuthStateChange — SIGNED_IN', () => {
    it('updates user and session on SIGNED_IN event', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await useAuthStore.getState().initialize();

      authStateCallback!('SIGNED_IN', fakeSession);

      expect(useAuthStore.getState().user).toEqual(fakeUser);
      expect(useAuthStore.getState().session).toEqual(fakeSession);
    });

    it('clears profile on non-RECOVERY auth state change', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await useAuthStore.getState().initialize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useAuthStore.setState({ profile: { username: 'bob', displayName: null, avatarUrl: null } as any });

      authStateCallback!('SIGNED_OUT', null);

      expect(useAuthStore.getState().profile).toBeNull();
    });
  });

  // ── signUp: auto-confirmed path (session returned) ───────────────────────

  describe('signUp — auto-confirmed (session present)', () => {
    it('sets session and user when signUp returns both user and session', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: fakeUser, session: fakeSession },
        error: null,
      });

      await useAuthStore.getState().signUp('test@test.com', 'password123');

      const state = useAuthStore.getState();
      expect(state.session).toEqual(fakeSession);
      expect(state.user).toEqual(fakeUser);
      expect(state.confirmationPending).toBe(false);
      expect(state.loading).toBe(false);
    });

    it('saves username to profile when signUp auto-confirms with username', async () => {
      const { upsertProfile } = await import('../../lib/profiles');
      mockSignUp.mockResolvedValue({
        data: { user: fakeUser, session: fakeSession },
        error: null,
      });

      await useAuthStore.getState().signUp('test@test.com', 'password123', 'alice');

      expect(upsertProfile).toHaveBeenCalledWith(fakeUser.id, { username: 'alice' });
    });
  });

  // ── clearConfirmation ─────────────────────────────────────────────────────

  describe('clearConfirmation', () => {
    it('resets confirmationPending to false', () => {
      useAuthStore.setState({ confirmationPending: true });
      useAuthStore.getState().clearConfirmation();
      expect(useAuthStore.getState().confirmationPending).toBe(false);
    });
  });

  // ── signIn: email-not-confirmed error ─────────────────────────────────────

  describe('signIn — email not confirmed', () => {
    it('shows a friendly message for email-not-confirmed error', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed' },
      });

      await useAuthStore.getState().signIn('test@test.com', 'password');

      expect(useAuthStore.getState().error).toMatch(/confirm/i);
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  // ── signOut: clears recoveryMode ──────────────────────────────────────────

  describe('signOut', () => {
    it('clears recoveryMode on successful sign-out', async () => {
      useAuthStore.setState({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user: fakeUser as any, session: fakeSession as any,
        loading: false, recoveryMode: true,
      });
      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().signOut();

      expect(useAuthStore.getState().recoveryMode).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('clears confirmationPending on sign-out', async () => {
      useAuthStore.setState({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user: fakeUser as any, session: fakeSession as any,
        loading: false, confirmationPending: true,
      });
      mockSignOut.mockResolvedValue({ error: null });

      await useAuthStore.getState().signOut();

      expect(useAuthStore.getState().confirmationPending).toBe(false);
    });
  });

  // ── initialize: no supabase scenario handled by no-op ────────────────────

  describe('initialize: graceful getSession failure', () => {
    it('handles unexpected rejection from getSession', async () => {
      mockGetSession.mockRejectedValue(new Error('Unexpected network failure'));

      await expect(useAuthStore.getState().initialize()).resolves.not.toThrow();

      expect(useAuthStore.getState().loading).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});
