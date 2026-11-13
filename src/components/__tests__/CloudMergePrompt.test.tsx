import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloudMergePrompt from '../CloudMergePrompt';

function renderPrompt(overrides: Partial<ComponentProps<typeof CloudMergePrompt>> = {}) {
  const onMerge = vi.fn();
  const onLater = vi.fn();
  render(
    <CloudMergePrompt
      bookCount={2}
      busy={false}
      error={null}
      onMerge={onMerge}
      onLater={onLater}
      {...overrides}
    />,
  );
  return { onMerge, onLater };
}

describe('CloudMergePrompt', () => {
  it('explains a plural merge and keeps both actions available', async () => {
    const user = userEvent.setup();
    const { onMerge, onLater } = renderPrompt();

    expect(screen.getByRole('dialog', { name: "Add this device's books to your account?" })).toBeInTheDocument();
    expect(screen.getByText(/You have 2 books saved on this device/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Merge and sync' }));
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onMerge).toHaveBeenCalledOnce();
    expect(onLater).toHaveBeenCalledOnce();
  });

  it('uses the singular count for one book', () => {
    renderPrompt({ bookCount: 1 });
    expect(screen.getByText(/You have 1 book saved on this device/)).toBeInTheDocument();
  });

  it('shows the error and blocks both actions while a merge is in progress', () => {
    renderPrompt({ busy: true, error: 'Could not reach your account.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach your account.');
    expect(screen.getByRole('button', { name: 'Merging…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
  });
});
