import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createAuthStore } from '../../../packages/shared/src/authStore.ts';

const session = {
  user: { id: 'user-1', email: 'reader@example.com' },
} as Session;

function client(overrides: Record<string, unknown> = {}) {
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session, user: session.user },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { session: null, user: session.user },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  return { auth } as unknown as SupabaseClient;
}

describe('createAuthStore', () => {
  it('finishes initialization when Supabase is not configured', async () => {
    const store = createAuthStore(() => null);
    await store.getState().initialize();
    expect(store.getState().loading).toBe(false);
    expect(store.getState().user).toBeNull();
  });

  it('restores a session and follows auth changes', async () => {
    let listener: ((event: string, next: Session | null) => void) | null = null;
    const supabase = client({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: vi.fn((cb: (event: string, next: Session | null) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    });
    const store = createAuthStore(() => supabase);
    await store.getState().initialize();
    expect(store.getState().user?.email).toBe('reader@example.com');
    listener?.('SIGNED_OUT', null);
    expect(store.getState().user).toBeNull();
  });

  it('records a session read error', async () => {
    const supabase = client({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'expired' } }),
    });
    const store = createAuthStore(() => supabase);
    await store.getState().initialize();
    expect(store.getState().error).toBe('expired');
  });

  it('signs in and maps an unconfirmed email', async () => {
    const supabase = client();
    const store = createAuthStore(() => supabase);
    await expect(store.getState().signIn('reader@example.com', 'secret')).resolves.toBe(true);
    expect(store.getState().user?.id).toBe('user-1');

    const unconfirmed = client({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Email not confirmed' },
      }),
    });
    const other = createAuthStore(() => unconfirmed);
    await expect(other.getState().signIn('reader@example.com', 'secret')).resolves.toBe(false);
    expect(other.getState().error).toMatch(/confirm your account/);
  });

  it('refuses email sign-in when the client is missing', async () => {
    const store = createAuthStore(() => null);
    await expect(store.getState().signIn('a@b.c', 'pw')).resolves.toBe(false);
    await expect(store.getState().signUp('a@b.c', 'pw')).resolves.toBe(false);
    await store.getState().signOut();
    expect(store.getState().error).toMatch(/not set up/);
  });

  it('waits for email confirmation on sign-up and reports provider errors', async () => {
    const store = createAuthStore(() => client());
    await expect(store.getState().signUp('reader@example.com', 'secret')).resolves.toBe(true);
    expect(store.getState().confirmationPending).toBe(true);

    const failing = createAuthStore(() => client({
      signUp: vi.fn().mockResolvedValue({ data: { session: null, user: null }, error: { message: 'taken' } }),
    }));
    await expect(failing.getState().signUp('reader@example.com', 'secret')).resolves.toBe(false);
    expect(failing.getState().error).toBe('taken');
  });

  it('stores an immediate session when sign-up does not need confirmation', async () => {
    const store = createAuthStore(() => client({
      signUp: vi.fn().mockResolvedValue({ data: { session, user: session.user }, error: null }),
    }));
    await expect(store.getState().signUp('reader@example.com', 'secret')).resolves.toBe(true);
    expect(store.getState().session).toBe(session);
    expect(store.getState().confirmationPending).toBe(false);
  });

  it('signs out and reports a sign-out failure', async () => {
    const store = createAuthStore(() => client());
    await store.getState().signIn('reader@example.com', 'secret');
    await store.getState().signOut();
    expect(store.getState().user).toBeNull();

    const failing = createAuthStore(() => client({
      signOut: vi.fn().mockResolvedValue({ error: { message: 'network' } }),
    }));
    await failing.getState().signOut();
    expect(failing.getState().error).toBe('network');
  });

  it('clears errors and accepts a session from the Google exchange', () => {
    const store = createAuthStore(() => null);
    store.getState().clearError();
    store.getState().setSession(session);
    expect(store.getState().user?.id).toBe('user-1');
    expect(store.getState().loading).toBe(false);
  });
});
