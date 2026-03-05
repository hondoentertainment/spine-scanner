import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthPanel from '../AuthPanel';

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockSignOut = vi.fn();
const mockLoadProfile = vi.fn();
const mockResetPassword = vi.fn();
const mockResendConfirmation = vi.fn();
const mockClearError = vi.fn();
const mockClearConfirmation = vi.fn();

let storeState = {
  user: null as unknown,
  profile: null as unknown,
  loading: false,
  error: null as string | null,
  confirmationPending: false,
};

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({
    ...storeState,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    signOut: mockSignOut,
    loadProfile: mockLoadProfile,
    resetPassword: mockResetPassword,
    resendConfirmation: mockResendConfirmation,
    clearError: mockClearError,
    clearConfirmation: mockClearConfirmation,
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
  lastSynced: null,
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
    };
  });

  it('shows sign-in button when not authenticated', () => {
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByText('Sign in to sync')).toBeInTheDocument();
  });

  it('shows sign-in form when button is clicked', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByText('Sign in to sync'));
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Password/)).toBeInTheDocument();
  });

  it('has a forgot password link', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByText('Sign in to sync'));
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  });

  it('shows forgot password form', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByText('Sign in to sync'));
    await userEvent.click(screen.getByText('Forgot password?'));
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
  });

  it('shows sign-up form with username field', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByText('Sign in to sync'));
    await userEvent.click(screen.getByText('Need an account? Sign up'));
    expect(screen.getByPlaceholderText('Username (optional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
  });

  it('shows user badge when authenticated', () => {
    storeState.user = { id: 'u1', email: 'test@test.com', user_metadata: {} };
    render(<AuthPanel {...defaultProps} />);
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
  });

  it('calls signOut when sign out button clicked', async () => {
    storeState.user = { id: 'u1', email: 'test@test.com', user_metadata: {} };
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByLabelText('Sign out'));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('shows Google sign-in button', async () => {
    render(<AuthPanel {...defaultProps} />);
    await userEvent.click(screen.getByText('Sign in to sync'));
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });
});
