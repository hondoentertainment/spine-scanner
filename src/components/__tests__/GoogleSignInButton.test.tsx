import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoogleSignInButton from '../GoogleSignInButton';

describe('GoogleSignInButton', () => {
  it('uses the Continue with Google label and keeps the logo', async () => {
    const onClick = vi.fn();
    render(<GoogleSignInButton onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button.querySelector('svg')).toBeTruthy();
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick while busy or disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<GoogleSignInButton onClick={onClick} busy />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    rerender(<GoogleSignInButton onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
