import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordReset from '../PasswordReset';

const mockUpdatePassword = vi.fn();
const mockClearError = vi.fn();

vi.mock('../../store/useAuthStore', () => ({
  useAuthStore: () => ({
    loading: false,
    error: null,
    updatePassword: mockUpdatePassword,
    clearError: mockClearError,
  }),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe('PasswordReset', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the password reset form', () => {
    render(<PasswordReset onComplete={onComplete} />);
    expect(screen.getByText('Set New Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('New password (min 6 characters)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm new password')).toBeInTheDocument();
    expect(screen.getByText('Update Password')).toBeInTheDocument();
  });

  it('shows validation error for short password', async () => {
    render(<PasswordReset onComplete={onComplete} />);
    const pwInput = screen.getByPlaceholderText('New password (min 6 characters)');
    const confirmInput = screen.getByPlaceholderText('Confirm new password');

    await userEvent.type(pwInput, 'abc');
    await userEvent.type(confirmInput, 'abc');
    fireEvent.submit(pwInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 6 characters.')).toBeInTheDocument();
    });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows validation error for mismatched passwords', async () => {
    render(<PasswordReset onComplete={onComplete} />);
    const pwInput = screen.getByPlaceholderText('New password (min 6 characters)');
    const confirmInput = screen.getByPlaceholderText('Confirm new password');

    await userEvent.type(pwInput, 'password123');
    await userEvent.type(confirmInput, 'different456');
    fireEvent.submit(pwInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls updatePassword on valid submission', async () => {
    mockUpdatePassword.mockResolvedValue(true);
    render(<PasswordReset onComplete={onComplete} />);
    const pwInput = screen.getByPlaceholderText('New password (min 6 characters)');
    const confirmInput = screen.getByPlaceholderText('Confirm new password');

    await userEvent.type(pwInput, 'newpassword123');
    await userEvent.type(confirmInput, 'newpassword123');
    fireEvent.submit(pwInput.closest('form')!);

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith('newpassword123');
    });
  });

  it('shows success state after password update', async () => {
    mockUpdatePassword.mockResolvedValue(true);
    render(<PasswordReset onComplete={onComplete} />);
    const pwInput = screen.getByPlaceholderText('New password (min 6 characters)');
    const confirmInput = screen.getByPlaceholderText('Confirm new password');

    await userEvent.type(pwInput, 'newpassword123');
    await userEvent.type(confirmInput, 'newpassword123');
    fireEvent.submit(pwInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Password Updated')).toBeInTheDocument();
    });
  });

  it('toggles password visibility', async () => {
    render(<PasswordReset onComplete={onComplete} />);
    const pwInput = screen.getByPlaceholderText('New password (min 6 characters)');
    const toggleBtn = screen.getByLabelText('Show password');

    expect(pwInput).toHaveAttribute('type', 'password');
    await userEvent.click(toggleBtn);
    expect(pwInput).toHaveAttribute('type', 'text');
  });

  it('shows password strength indicator', async () => {
    render(<PasswordReset onComplete={onComplete} />);
    const pwInput = screen.getByPlaceholderText('New password (min 6 characters)');

    await userEvent.type(pwInput, 'abc');
    expect(screen.getByText('Too short')).toBeInTheDocument();

    await userEvent.clear(pwInput);
    await userEvent.type(pwInput, 'abcdefgh');
    expect(screen.getByText('Fair')).toBeInTheDocument();

    await userEvent.clear(pwInput);
    await userEvent.type(pwInput, 'abcdefghijkl');
    expect(screen.getByText('Good')).toBeInTheDocument();

    await userEvent.clear(pwInput);
    await userEvent.type(pwInput, 'abcdefghijklmnop');
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });
});
