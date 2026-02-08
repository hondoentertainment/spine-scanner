import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Scanner from '../Scanner';
import { ToastProvider } from '../Toast';

vi.mock('react-webcam', () => {
  let webcamState = {
    readyState: 4,
    screenshot: 'data:image/jpeg;base64,abc',
    autoUserMedia: true,
    autoError: null as Error | null,
  };

  const setWebcamState = (next: Partial<typeof webcamState>) => {
    webcamState = { ...webcamState, ...next };
  };

  const Webcam = React.forwardRef((props: any, ref) => {
    React.useEffect(() => {
      if (webcamState.autoError) {
        props.onUserMediaError?.(webcamState.autoError);
      } else if (webcamState.autoUserMedia) {
        props.onUserMedia?.();
      }
    }, [props]);

    const video = {
      readyState: webcamState.readyState,
      videoWidth: 640,
      videoHeight: 480,
    };

    React.useImperativeHandle(ref, () => ({
      video,
      getScreenshot: () => webcamState.screenshot,
    }));

    return <div data-testid="webcam" />;
  });

  return { default: Webcam, __setWebcamState: setWebcamState };
});

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

describe('Scanner camera readiness', () => {
  beforeEach(async () => {
    const mod = await import('react-webcam') as any;
    mod.__setWebcamState({
      readyState: 4,
      screenshot: 'data:image/jpeg;base64,abc',
      autoUserMedia: true,
      autoError: null,
    });
  });

  it('shows camera error and disables capture on permission failure', async () => {
    const mod = await import('react-webcam') as any;
    mod.__setWebcamState({
      autoUserMedia: false,
      autoError: new Error('Permission denied'),
    });

    renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Camera error: Permission denied/i)).toBeInTheDocument();
    });

    const capture = screen.getByRole('button', { name: /capture and scan/i });
    expect(capture).toBeDisabled();
  });

  it('enables capture after camera is ready', async () => {
    renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

    const capture = screen.getByRole('button', { name: /capture and scan/i });
    await waitFor(() => expect(capture).not.toBeDisabled());
  });

  it('shows not-ready status if video is not ready', async () => {
    const mod = await import('react-webcam') as any;
    mod.__setWebcamState({
      readyState: 1,
      autoUserMedia: true,
      autoError: null,
    });

    renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

    const capture = screen.getByRole('button', { name: /capture and scan/i });
    await waitFor(() => expect(capture).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(capture);
    });

    // Open debug logs and assert the not-ready message was logged
    fireEvent.click(screen.getByRole('button', { name: /show debug logs/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error: Video not ready/i)).toBeInTheDocument();
    });
  });
});
