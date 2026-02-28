import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Scanner from '../Scanner';
import { ToastProvider } from '../Toast';

/* ================================================================
 *  Global DOM mocks for jsdom
 * ================================================================
 *
 *  jsdom doesn't fire Image.onload for data URLs and has no canvas
 *  implementation. We mock both to enable Scanner component testing.
 */

// ── Mock Image class ──────────────────────────────────────────
const OriginalImage = globalThis.Image;

class MockImage {
  width = 640;
  height = 480;
  src = '';
  onload: (() => void) | null = null;
  onerror: ((err: Error) => void) | null = null;

  constructor() {
    // Auto-fire onload when src is set via microtask (faster than setTimeout)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy = new Proxy(this as any, {
      set(target, prop, value) {
        target[prop] = value;
        if (prop === 'src' && value && target.onload) {
          // Use Promise.resolve().then for microtask scheduling —
          // much faster than setTimeout(0) which uses macrotask queue
          Promise.resolve().then(() => target.onload?.());
        }
        return true;
      },
    });
    return proxy;
  }
}

// ── Mock Canvas 2D Context ────────────────────────────────────
// Use plain functions (NOT vi.fn()) so vi.restoreAllMocks() can't clear them
const mockCtx = {
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  drawImage() {},
  filter: '',
};

const origGetContext = HTMLCanvasElement.prototype.getContext;
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;

beforeEach(() => {
  // @ts-expect-error mock Image
  globalThis.Image = MockImage;

  // Plain function wrappers — immune to vi.restoreAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HTMLCanvasElement.prototype.getContext = (() => mockCtx) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/png;base64,mockcanvas') as any;
});

afterEach(() => {
  globalThis.Image = OriginalImage;
  HTMLCanvasElement.prototype.getContext = origGetContext;
  HTMLCanvasElement.prototype.toDataURL = origToDataURL;
});

/* ================================================================
 *  Library mocks
 * ================================================================ */

// ── react-webcam ──────────────────────────────────────────────
vi.mock('react-webcam', () => {
  let webcamState = {
    readyState: 4,
    screenshot: 'data:image/jpeg;base64,abc',
    autoUserMedia: true,
    autoError: null as Error | null,
  };

  const setWebcamState = (next: Partial<typeof webcamState>) => {
    webcamState = { ...webcamState, ...next };
    callbackFired = false; // Reset so the next render fires the callback
  };

  // Track whether the media callback has been fired for the current render cycle.
  // Reset via __setWebcamState (called in beforeEach) so each test starts fresh.
  let callbackFired = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Webcam = React.forwardRef((props: Record<string, any>, ref) => {
    React.useEffect(() => {
      // Fire the media callback only once to prevent infinite re-render loops.
      // (State updates inside the callback trigger re-renders → new props → useEffect re-fires.)
      if (callbackFired) return;
      callbackFired = true;
      if (webcamState.autoError) {
        props.onUserMediaError?.(webcamState.autoError);
      } else if (webcamState.autoUserMedia) {
        props.onUserMedia?.();
      }
    }, [props]);

    React.useImperativeHandle(ref, () => ({
      video: {
        readyState: webcamState.readyState,
        videoWidth: 640,
        videoHeight: 480,
      },
      getScreenshot: () => webcamState.screenshot,
    }));

    return <div data-testid="webcam" />;
  });

  return { default: Webcam, __setWebcamState: setWebcamState };
});

// ── @zxing/browser ────────────────────────────────────────────
let barcodeResult: string | null = null;

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    async decodeFromImageElement() {
      if (barcodeResult === null) throw new Error('No barcode');
      return { getText: () => barcodeResult };
    }
    async decodeFromVideoElement(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _video: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback?: (result: any, error: any) => void,
    ) {
      // Simulate ZXing continuous mode: call callback once, then return controls
      if (callback) {
        setTimeout(() => {
          if (barcodeResult !== null) {
            callback({ getText: () => barcodeResult }, null);
          } else {
            callback(null, new Error('No barcode'));
          }
        }, 50);
      }
      return { stop: vi.fn() };
    }
  },
}));

vi.mock('@zxing/library', () => ({
  DecodeHintType: { POSSIBLE_FORMATS: 0, TRY_HARDER: 1 },
  BarcodeFormat: { EAN_13: 0, UPC_A: 2 },
  NotFoundException: class NotFoundException extends Error {
    constructor() { super('Not found'); }
  },
}));

// ── tesseract.js ──────────────────────────────────────────────
let ocrText = '';
let createWorkerShouldFail = false;
let workerShouldFail = false;

vi.mock('tesseract.js', () => ({
  createWorker: async () => {
    if (createWorkerShouldFail) throw new Error('Worker creation failed');
    return {
      setParameters: async () => ({ data: null, jobId: '' }),
      recognize: async () => {
        if (workerShouldFail) throw new Error('recognize failed');
        return { data: { text: ocrText } };
      },
      terminate: async () => {},
    };
  },
  recognize: async () => {
    return { data: { text: ocrText } };
  },
  PSM: {
    OSD_ONLY: '0', AUTO_OSD: '1', AUTO_ONLY: '2', AUTO: '3',
    SINGLE_COLUMN: '4', SINGLE_BLOCK_VERT_TEXT: '5', SINGLE_BLOCK: '6',
    SINGLE_LINE: '7', SINGLE_WORD: '8', CIRCLE_WORD: '9', SINGLE_CHAR: '10',
    SPARSE_TEXT: '11', SPARSE_TEXT_OSD: '12', RAW_LINE: '13',
  },
}));

/* ================================================================
 *  Helpers
 * ================================================================ */

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

/* ================================================================
 *  Tests
 * ================================================================ */

describe('Scanner', () => {
  beforeEach(async () => {
    ocrText = '';
    barcodeResult = null;
    createWorkerShouldFail = false;
    workerShouldFail = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('react-webcam') as any;
    mod.__setWebcamState({
      readyState: 4,
      screenshot: 'data:image/jpeg;base64,abc',
      autoUserMedia: true,
      autoError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ── Camera readiness ──────────────────────────────────────── */
  describe('camera readiness', () => {
    it('shows camera error and upload fallback on permission failure', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('react-webcam') as any;
      mod.__setWebcamState({
        autoUserMedia: false,
        autoError: new Error('Permission denied'),
      });

      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByText(/Can't access camera: Permission denied/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /scan book/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upload a photo/i })).toBeInTheDocument();
    });

    it('enables capture after camera is ready', async () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);
      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
    });

    it('shows not-ready status if video readyState < 2', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('react-webcam') as any;
      mod.__setWebcamState({ readyState: 1, autoUserMedia: true, autoError: null });

      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());

      await act(async () => { fireEvent.click(capture); });

      fireEvent.click(screen.getByRole('button', { name: /show debug logs/i }));
      await waitFor(() => {
        expect(screen.getByText(/Error: Video not ready/i)).toBeInTheDocument();
      });
    });
  });

  /* ── Barcode scanning ──────────────────────────────────────── */
  describe('barcode scanning', () => {
    it('calls onScan when valid barcode is detected', async () => {
      barcodeResult = '9780141036144';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780141036144'), { timeout: 12000 });
    }, 15000);

    it('falls through to OCR if barcode has invalid checksum (no repair)', async () => {
      barcodeResult = '9780141036145'; // invalid, tryFixChecksum returns null
      ocrText = 'No ISBN here at all';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      // Give it time to run through OCR passes
      await new Promise(r => setTimeout(r, 2000));
      expect(onScan).not.toHaveBeenCalled();
    }, 10000);

    it('calls onScan with repaired ISBN when barcode has repairable checksum', async () => {
      // 9780306406151 is invalid; tryFixChecksum repairs to 9780306466151 (0→6 at position 7)
      barcodeResult = '9780306406151';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780306466151'), { timeout: 8000 });
    }, 10000);
  });

  /* ── OCR scanning ──────────────────────────────────────────── */
  describe('OCR scanning', () => {
    it('calls onScan when OCR finds valid ISBN in text', async () => {
      ocrText = 'THE GREAT GATSBY ISBN 978-0-14-103614-4 PENGUIN BOOKS';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780141036144'), { timeout: 10000 });
    }, 15000);

    it('shows suggestions when OCR finds invalid-checksum candidate', async () => {
      // Use unrepairable ISBN (tryFixChecksum returns null) so suggestions are shown
      ocrText = 'ISBN 1111111111111';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      // Should not auto-submit invalid ISBN; should show suggestion (formatted)
      await waitFor(() => {
        expect(screen.getByText('111-1-11-111111-1')).toBeInTheDocument();
      }, { timeout: 10000 });
      expect(onScan).not.toHaveBeenCalled();
    }, 15000);

    it('populates manual form when user clicks invalid ISBN suggestion', async () => {
      // Use invalid ISBN with no valid checksum repair (tryFixChecksum returns null)
      ocrText = 'ISBN 1111111111111';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      await waitFor(() => {
        expect(screen.getByText('111-1-11-111111-1')).toBeInTheDocument();
      }, { timeout: 10000 });

      // Click the invalid suggestion - should populate manual form
      const suggestionBtn = screen.getByRole('button', { name: /111-1-11-111111-1/ });
      fireEvent.click(suggestionBtn);

      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /enter isbn/i });
        expect(input).toHaveValue('1111111111111');
      });
    }, 15000);

    it('does not call onScan when OCR returns no ISBN candidates', async () => {
      ocrText = 'Just some random text with absolutely no numbers anywhere';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      // Wait for the full pipeline to complete (7 OCR passes with no results)
      await new Promise(r => setTimeout(r, 3000));
      // onScan should never have been called
      expect(onScan).not.toHaveBeenCalled();
      // Manual entry form should have been shown (the "no candidates" path sets showManual)
      expect(screen.getByPlaceholderText(/type isbn/i)).toBeInTheDocument();
    }, 15000);
  });

  /* ── Worker failure and fallback ───────────────────────────── */
  describe('worker failure fallback', () => {
    it('falls back to one-shot recognize() when worker creation fails', async () => {
      createWorkerShouldFail = true;
      ocrText = 'ISBN 978-0-14-103614-4';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780141036144'), { timeout: 10000 });
    }, 15000);

    it('recovers when worker.recognize throws', async () => {
      workerShouldFail = true;
      ocrText = 'ISBN 978-0-14-103614-4';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      const capture = screen.getByRole('button', { name: /scan book/i });
      await waitFor(() => expect(capture).not.toBeDisabled());
      await act(async () => { fireEvent.click(capture); });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780141036144'), { timeout: 10000 });
    }, 15000);
  });

  /* ── Manual ISBN entry ─────────────────────────────────────── */
  describe('manual ISBN entry', () => {
    it('opens manual entry form', () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);
      fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
      expect(screen.getByPlaceholderText(/type isbn/i)).toBeInTheDocument();
    });

    it('submits valid manual ISBN', () => {
      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
      fireEvent.change(screen.getByPlaceholderText(/type isbn/i), { target: { value: '9780141036144' } });
      fireEvent.click(screen.getByRole('button', { name: /submit isbn/i }));

      expect(onScan).toHaveBeenCalledWith('9780141036144');
    });

    it('rejects ISBN with wrong length', () => {
      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
      fireEvent.change(screen.getByPlaceholderText(/type isbn/i), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /submit isbn/i }));

      expect(onScan).not.toHaveBeenCalled();
    });

    it('rejects ISBN with invalid checksum', () => {
      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
      fireEvent.change(screen.getByPlaceholderText(/type isbn/i), { target: { value: '9780141036145' } });
      fireEvent.click(screen.getByRole('button', { name: /submit isbn/i }));

      expect(onScan).not.toHaveBeenCalled();
    });

    it('accepts valid ISBN-10', () => {
      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
      fireEvent.change(screen.getByPlaceholderText(/type isbn/i), { target: { value: '0743273567' } });
      fireEvent.click(screen.getByRole('button', { name: /submit isbn/i }));

      expect(onScan).toHaveBeenCalledWith('0743273567');
    });

    it('closes manual form', () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);
      fireEvent.click(screen.getByRole('button', { name: /type isbn/i }));
      expect(screen.getByPlaceholderText(/type isbn/i)).toBeInTheDocument();

      fireEvent.click(screen.getByText(/back to scanning/i));
      expect(screen.queryByPlaceholderText(/type isbn/i)).not.toBeInTheDocument();
    });
  });

  /* ── Debug log panel ───────────────────────────────────────── */
  describe('debug panel', () => {
    it('toggles debug panel', () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      fireEvent.click(screen.getByRole('button', { name: /show debug logs/i }));
      expect(screen.getByText('SCANNER LOGS')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /hide debug logs/i }));
      expect(screen.queryByText('SCANNER LOGS')).not.toBeInTheDocument();
    });
  });

  /* ── Scan controls ─────────────────────────────────────────── */
  describe('scan controls', () => {
    it('disables capture while isScanning is true', () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={true} />);
      const btn = screen.getByRole('button', { name: /scan book|scanning in progress/i });
      expect(btn).toBeDisabled();
    });
  });

  /* ── Photo upload UI ──────────────────────────────────────── */
  describe('photo upload', () => {
    let OriginalFileReader: typeof globalThis.FileReader;

    beforeEach(() => {
      OriginalFileReader = globalThis.FileReader;
      // Mock FileReader so result can be set (jsdom's result is read-only)
      vi.stubGlobal(
        'FileReader',
        class MockFileReader {
          result: string | null = null;
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          readAsDataURL() {
            this.result = 'data:image/png;base64,iVBORw0KGgo=';
            Promise.resolve().then(() => this.onload?.());
          }
        },
      );
    });

    afterEach(() => {
      vi.stubGlobal('FileReader', OriginalFileReader);
    });

    it('shows upload button alongside capture when camera works', () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);
      expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
    });

    it('renders hidden file input with correct attributes', () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      expect(fileInput.getAttribute('accept')).toBe('image/*');
      expect(fileInput.getAttribute('capture')).toBe('environment');
      expect(fileInput.getAttribute('aria-hidden')).toBe('true');
      expect(fileInput.style.display).toBe('none');
    });

    it('calls onScan when photo contains valid barcode', async () => {
      barcodeResult = '9780141036144';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'test.png', { type: 'image/png' });

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780141036144'), { timeout: 8000 });
    }, 10000);

    it('calls onScan via OCR when photo has no barcode but OCR finds ISBN', async () => {
      barcodeResult = null;
      ocrText = 'Penguin Classics  ISBN 978-0-14-103614-4  The Great Gatsby';

      const onScan = vi.fn();
      renderWithToast(<Scanner onScan={onScan} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload photo/i })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'spine.jpg', { type: 'image/jpeg' });

      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [file] } });
      });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith('9780141036144'), { timeout: 15000 });
    }, 20000);
  });

  /* ── Camera error fallback UI ─────────────────────────────── */
  describe('camera error fallback', () => {
    it('shows upload + manual entry when camera fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('react-webcam') as any;
      mod.__setWebcamState({
        autoUserMedia: false,
        autoError: new Error('Could not start video source'),
      });

      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload a photo/i })).toBeInTheDocument();
      });
      const manualEntryElements = screen.getAllByText(/Type ISBN manually/i);
      expect(manualEntryElements.length).toBeGreaterThanOrEqual(1);
    });

    it('hides scan button when camera fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('react-webcam') as any;
      mod.__setWebcamState({
        autoUserMedia: false,
        autoError: new Error('Permission denied'),
      });

      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /upload a photo/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /scan book/i })).not.toBeInTheDocument();
    });

    it('shows status message about alternatives', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('react-webcam') as any;
      mod.__setWebcamState({
        autoUserMedia: false,
        autoError: new Error('No camera'),
      });

      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByText(/upload a photo or type the ISBN/i)).toBeInTheDocument();
      });
    });

    it('logs camera error to debug panel', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import('react-webcam') as any;
      mod.__setWebcamState({
        autoUserMedia: false,
        autoError: new Error('Device not found'),
      });

      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      // Camera error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Can't access camera: Device not found/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /show debug logs/i }));

      // Debug logs should contain the error message
      await waitFor(() => {
        const logEntries = screen.getAllByText(/Device not found/);
        expect(logEntries.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  /* ── OCR enhancements: accessibility ──────────────────────── */
  describe('OCR enhancements', () => {
    it('capture button has aria-describedby linking to status text', async () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /scan book/i })).toBeInTheDocument();
      });

      const captureBtn = screen.getByRole('button', { name: /scan book/i });
      expect(captureBtn).toHaveAttribute('aria-describedby', 'status-text');
    });

    it('status text has id for aria-describedby reference', async () => {
      renderWithToast(<Scanner onScan={vi.fn()} isScanning={false} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /scan book/i })).toBeInTheDocument();
      });

      const statusText = document.getElementById('status-text');
      expect(statusText).toBeInTheDocument();
    });
  });
});
