import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PwaUpdatePrompt from '../PwaUpdatePrompt';

const pwa = vi.hoisted(() => {
  const listeners = new Set<(visible: boolean) => void>();
  return {
    listeners,
    applyPwaUpdate: vi.fn(async () => {}),
    dismissPwaRefresh: vi.fn(() => {
      listeners.forEach((listener) => listener(false));
    }),
    emit(visible: boolean) {
      listeners.forEach((listener) => listener(visible));
    },
  };
});

vi.mock('../../pwa/updateRegistration.ts', () => ({
  subscribePwaRefresh: (listener: (visible: boolean) => void) => {
    pwa.listeners.add(listener);
    listener(false);
    return () => {
      pwa.listeners.delete(listener);
    };
  },
  dismissPwaRefresh: () => pwa.dismissPwaRefresh(),
  applyPwaUpdate: () => pwa.applyPwaUpdate(),
}));

describe('PwaUpdatePrompt', () => {
  it('stays hidden until an update is ready, then reloads or dismisses', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PwaUpdatePrompt />);
    expect(screen.queryByRole('alert', { name: 'App update available' })).not.toBeInTheDocument();

    act(() => { pwa.emit(true); });
    expect(screen.getByRole('alert', { name: 'App update available' })).toBeInTheDocument();
    expect(screen.getByText('Reload to get the latest SpineScanner improvements.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(pwa.applyPwaUpdate).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(pwa.dismissPwaRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert', { name: 'App update available' })).not.toBeInTheDocument();

    unmount();
    act(() => { pwa.emit(true); });
    expect(screen.queryByRole('alert', { name: 'App update available' })).not.toBeInTheDocument();
  });
});
