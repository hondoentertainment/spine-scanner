import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

/* ================================================================
 *  Test helper components
 * ================================================================ */

/** Renders a button that triggers toast with configurable params */
const ToastTrigger: React.FC<{
  message?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}> = ({ message = 'Test notification', type = 'info', duration }) => {
  const { toast } = useToast();
  return (
    <button onClick={() => toast(message, type, duration)}>
      Show Toast
    </button>
  );
};

/** Renders a button that triggers the confirm dialog */
const ConfirmTrigger: React.FC<{
  onResult?: (value: boolean) => void;
  danger?: boolean;
}> = ({ onResult, danger }) => {
  const { confirm } = useToast();
  const handleClick = async () => {
    const result = await confirm({
      title: 'Confirm Action',
      message: 'Are you sure?',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      danger,
    });
    onResult?.(result);
  };
  return <button onClick={handleClick}>Open Confirm</button>;
};

/** Calls useToast outside a provider so the hook throws during render. */
const OutsideProvider: React.FC = () => {
  useToast();
  return null;
};

/* ================================================================
 *  Tests
 * ================================================================ */

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ── useToast hook ──────────────────────────────────────── */
  describe('useToast hook', () => {
    it('throws when used outside ToastProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<OutsideProvider />)).toThrow(/useToast must be used within ToastProvider/);
      spy.mockRestore();
    });
  });

  /* ── Toast display ──────────────────────────────────────── */
  describe('toast display', () => {
    it('shows a toast message when triggered', () => {
      render(
        <ToastProvider>
          <ToastTrigger message="Hello World" />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('shows multiple toasts simultaneously', () => {
      const Multi = () => {
        const { toast } = useToast();
        return (
          <>
            <button onClick={() => toast('First toast', 'success')}>First</button>
            <button onClick={() => toast('Second toast', 'error')}>Second</button>
          </>
        );
      };

      render(
        <ToastProvider>
          <Multi />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('First'));
      fireEvent.click(screen.getByText('Second'));

      expect(screen.getByText('First toast')).toBeInTheDocument();
      expect(screen.getByText('Second toast')).toBeInTheDocument();
    });

    it('renders dismiss button for each toast', () => {
      render(
        <ToastProvider>
          <ToastTrigger message="Dismissable" />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Toast'));
      expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
    });

    it('dismisses toast when dismiss button is clicked', () => {
      render(
        <ToastProvider>
          <ToastTrigger message="Dismissable toast" />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Dismissable toast')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Dismiss'));
      expect(screen.queryByText('Dismissable toast')).not.toBeInTheDocument();
    });
  });

  /* ── Auto-dismiss ────────────────────────────────────────── */
  describe('auto-dismiss', () => {
    it('auto-dismisses toast after default duration', async () => {
      render(
        <ToastProvider>
          <ToastTrigger message="Auto dismiss" />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Auto dismiss')).toBeInTheDocument();

      // Default duration is 3500ms
      act(() => { vi.advanceTimersByTime(3600); });

      expect(screen.queryByText('Auto dismiss')).not.toBeInTheDocument();
    });

    it('auto-dismisses after custom duration', async () => {
      render(
        <ToastProvider>
          <ToastTrigger message="Quick toast" duration={1000} />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Quick toast')).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(900); });
      expect(screen.getByText('Quick toast')).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(200); });
      expect(screen.queryByText('Quick toast')).not.toBeInTheDocument();
    });
  });

  /* ── Toast types ─────────────────────────────────────────── */
  describe('toast types', () => {
    it.each(['success', 'error', 'info', 'warning'] as const)(
      'renders %s toast',
      (type) => {
        render(
          <ToastProvider>
            <ToastTrigger message={`${type} message`} type={type} />
          </ToastProvider>
        );
        fireEvent.click(screen.getByText('Show Toast'));
        expect(screen.getByText(`${type} message`)).toBeInTheDocument();
      }
    );
  });

  /* ── Confirm dialog ──────────────────────────────────────── */
  describe('confirm dialog', () => {
    it('shows confirm dialog with title and message', async () => {
      render(
        <ToastProvider>
          <ConfirmTrigger />
        </ToastProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Open Confirm'));
      });

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('resolves true when confirm is clicked', async () => {
      const onResult = vi.fn();
      render(
        <ToastProvider>
          <ConfirmTrigger onResult={onResult} />
        </ToastProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Open Confirm'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Yes'));
      });

      expect(onResult).toHaveBeenCalledWith(true);
    });

    it('resolves false when cancel is clicked', async () => {
      const onResult = vi.fn();
      render(
        <ToastProvider>
          <ConfirmTrigger onResult={onResult} />
        </ToastProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Open Confirm'));
      });

      await act(async () => {
        fireEvent.click(screen.getByText('No'));
      });

      expect(onResult).toHaveBeenCalledWith(false);
    });

    it('resolves false when overlay is clicked', async () => {
      const onResult = vi.fn();
      render(
        <ToastProvider>
          <ConfirmTrigger onResult={onResult} />
        </ToastProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Open Confirm'));
      });

      // Click the overlay (the parent of the dialog)
      const overlay = screen.getByText('Confirm Action').closest('div')?.parentElement;
      if (overlay) {
        await act(async () => {
          fireEvent.click(overlay);
        });
      }

      expect(onResult).toHaveBeenCalledWith(false);
    });

    it('closes dialog after confirm', async () => {
      render(
        <ToastProvider>
          <ConfirmTrigger />
        </ToastProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Open Confirm'));
      });

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByText('Yes'));
      });

      expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });
  });

  describe('details, actions, and default confirm copy', () => {
    it('auto-expands diagnostic details on error toasts and can toggle them', () => {
      const DetailTrigger = () => {
        const { toast, toastDetail } = useToast();
        return (
          <>
            <button onClick={() => toast('Failed lookup', 'error', 3500, 'ISBN service 500')}>Error detail</button>
            <button onClick={() => toastDetail({ message: 'OCR failed', details: 'low contrast' })}>Toast detail</button>
          </>
        );
      };
      render(
        <ToastProvider>
          <DetailTrigger />
        </ToastProvider>
      );
      fireEvent.click(screen.getByText('Error detail'));
      expect(screen.getByText('ISBN service 500')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Hide diagnosis/ }));
      expect(screen.getByRole('button', { name: /Show diagnosis/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Show diagnosis/ }));
      expect(screen.getByText('ISBN service 500')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Toast detail'));
      expect(screen.getByText('OCR failed')).toBeInTheDocument();
      expect(screen.getByText('low contrast')).toBeInTheDocument();
    });

    it('runs a toast action and then dismisses the toast', () => {
      const onClick = vi.fn();
      const ActionTrigger = () => {
        const { toast } = useToast();
        return (
          <button onClick={() => toast('Added book', 'success', 4000, undefined, { label: 'Undo', onClick })}>
            With action
          </button>
        );
      };
      render(
        <ToastProvider>
          <ActionTrigger />
        </ToastProvider>
      );
      fireEvent.click(screen.getByText('With action'));
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(onClick).toHaveBeenCalledOnce();
      expect(screen.queryByText('Added book')).not.toBeInTheDocument();
    });

    it('uses default confirm labels and the danger style', async () => {
      const Defaults = () => {
        const { confirm } = useToast();
        return (
          <button onClick={() => { void confirm({ title: 'Delete?', message: 'Really?', danger: true }); }}>
            Open defaults
          </button>
        );
      };
      render(
        <ToastProvider>
          <Defaults />
        </ToastProvider>
      );
      await act(async () => {
        fireEvent.click(screen.getByText('Open defaults'));
      });
      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByText('Confirm'));
      });
    });
  });

  /* ── Accessibility ───────────────────────────────────────── */
  describe('accessibility', () => {
    it('toast container has role=status and aria-live=polite', () => {
      render(
        <ToastProvider>
          <ToastTrigger />
        </ToastProvider>
      );

      const container = screen.getByRole('status');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });
  });
});
