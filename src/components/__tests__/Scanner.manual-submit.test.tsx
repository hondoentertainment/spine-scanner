import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const tryBarcodeDecode = vi.fn();
const setTelemetryCallback = vi.fn();
const runPipeline = vi.fn();
const preWarm = vi.fn();
const runOcr = vi.fn();
const runOcrWithLang = vi.fn();
const captureAveragedFrame = vi.fn();

vi.mock('react-webcam', () => {
  const Webcam = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      video: {
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
      },
      getScreenshot: () => 'data:image/jpeg;base64,abc',
    }));

    return <div data-testid="webcam" />;
  });

  return { default: Webcam };
});

vi.mock('../../hooks/useBarcodeScanner.ts', () => ({
  useBarcodeScanner: () => ({
    tryBarcodeDecode,
    continuousActiveRef: { current: false },
    setTelemetryCallback,
  }),
}));

vi.mock('../../hooks/useOcrEngine.ts', () => ({
  PSM: { SINGLE_BLOCK: '6', SINGLE_LINE: '7', SPARSE_TEXT: '11' },
  useOcrEngine: () => ({
    preWarm,
    runOcr,
    runOcrWithLang,
    ocrState: 'ready',
  }),
}));

vi.mock('../../hooks/useFrameAveraging.ts', () => ({
  useFrameAveraging: () => ({
    captureAveragedFrame,
  }),
}));

vi.mock('../../hooks/useScanPipeline.ts', () => ({
  CROP_MEDIUM: { widthFrac: 0.94, heightFrac: 0.5, label: 'medium' },
  assessVideoFrameQuality: () => ({ isBlurry: false, isDark: false }),
  useScanPipeline: () => ({
    runPipeline,
  }),
}));

vi.mock('../../utils/haptics.ts', () => ({
  hapticSuccess: () => {},
  hapticFailure: () => {},
  hapticHoldSteady: () => {},
}));

import Scanner from '../Scanner';
import { ToastProvider } from '../Toast';

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

describe('Scanner manual submit', () => {
  it('disables the submit button while an async submit is in flight', async () => {
    let resolveScan: (() => void) | undefined;
    const onScan = vi.fn(() => new Promise<void>((resolve) => {
      resolveScan = resolve;
    }));

    renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

    fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /enter isbn/i }), {
      target: { value: '9780141036144' },
    });

    const submitButton = screen.getByRole('button', { name: /submit isbn/i });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());
    expect(onScan).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveScan?.();
    });
  });
});
