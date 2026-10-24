import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPanel from '../AuthPanel';

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithMagicLink = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockSignOut = vi.fn();
const mockLoadProfile = vi.fn();
const mockResetPassword = vi.fn();
const mockResendConfirmation = vi.fn();
const mockClearError = vi.fn();
const mockClearConfirmation = vi.fn();
const mockClearMagicLinkSent = vi.fn();

let storeState = {
  user: null as unknown,
  profile: null as unknown,
  loading: false,
  error: null as string | null,
  confirmationPending: false,
  magicLinkSent: false,
};

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({
    ...storeState,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signInWithMagicLink: mockSignInWithMagicLink,
    signInWithGoogle: mockSignInWithGoogle,
    signOut: mockSignOut,
    loadProfile: mockLoadProfile,
    resetPassword: mockResetPassword,
    resendConfirmation: mockResendConfirmation,
    clearError: mockClearError,
    clearConfirmation: mockClearConfirmation,
    clearMagicLinkSent: mockClearMagicLinkSent,
  }),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock('../../lib/profiles', () => ({
  upsertProfile: vi.fn().mockResolvedValue(true),
}));

const defaultProps = {
  onSyncNow: vi.fn(),
  syncing: false,
  lastSyncedAt: null,
  online: true,
  pendingChanges: 0,
  onOpenProfile: vi.fn(),
};

describe('AuthPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      user: null,
      profile: null,
      loading: false,
      error: null,
      confirmationPending: false,
      magicLinkSent: false,
    };
  });

  it('shows Continue with Google when not authenticated', () => {
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it('shows sign-in form when email is chosen', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use email instead' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a sign-in link/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign in with a password/i }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('has a forgot password link', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use email instead' }));
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  });

  it('shows forgot password form', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use email instead' }));
    await userEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
  });

  it('shows sign-up form with username field', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use email instead' }));
    await userEvent.click(screen.getByText('Need an account? Sign up'));
    expect(screen.getByLabelText('Username (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows user badge when authenticated', () => {
    storeState.user = { id: 'u1', email: 'test@test.com', user_metadata: {} };
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
  });

  it('shows the Google name, email, and avatar when present', () => {
    storeState.user = {
      id: 'u1',
      email: 'ada@example.com',
      user_metadata: { full_name: 'Ada Lovelace', avatar_url: 'https://example.com/ada.png' },
    };
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://example.com/ada.png');
  });

  it('calls signOut when sign out button clicked', async () => {
    storeState.user = { id: 'u1', email: 'test@test.com', user_metadata: {} };
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByLabelText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('starts Google sign-in from the header button', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mockSignInWithGoogle).toHaveBeenCalledOnce();
  });

  it('disables Continue with Google while offline', () => {
    render(<AuthPanel {...defaultProps} online={false} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('shows a Google error without leaving the signed-out state', () => {
    storeState.error = 'Google sign-in was cancelled. Your library is still on this device.';
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/i);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('shows a friendly provider-disabled error on the signed-out screen', () => {
    storeState.error = "Google sign-in isn't available for this app yet. You can still sign in with email.";
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't available/i);
    expect(screen.getByRole('button', { name: 'Use email instead' })).toBeEnabled();
  });

  it('validates the email before sending a magic link', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use email instead' }));
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(mockSignInWithMagicLink).not.toHaveBeenCalled();
  });

  it('sends a magic link for a valid email and shows check your email', async () => {
    mockSignInWithMagicLink.mockResolvedValue(undefined);
    const view = render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use email instead' }));
    await userEvent.type(screen.getByLabelText('Email'), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    expect(mockSignInWithMagicLink).toHaveBeenCalledWith('reader@example.com');

    storeState.magicLinkSent = true;
    view.rerender(<AuthPanel {...defaultProps} />);
    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
  });

  it('does not send a second Google sign-in while the first is in flight', async () => {
    let release: () => void = () => undefined;
    mockSignInWithGoogle.mockReturnValue(new Promise<void>((resolve) => {
      release = resolve;
    }));
    render(<AuthPanel {...defaultProps} />);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(mockSignInWithGoogle).toHaveBeenCalledOnce();
    release();
  });

  it('disables sign-in actions while a request is loading', () => {
    storeState.loading = true;
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
  });
});
