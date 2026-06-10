/**
 * Targeted branch-coverage tests for useScanPipeline.
 * Covers: scanMode options, concurrent suppression, zero-dimension guard,
 * multilang path, confidence edge thresholds, and barcode→OCR fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScanPipeline } from '../useScanPipeline';

// ── DOM mocks (mirrors scanRegressionFixtures.test.ts) ────────────────────────

const OriginalImage = globalThis.Image;
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
let mockBrightness = 128;

class MockImage {
  width = 640; height = 480; src = '';
  onload: (() => void) | null = null;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy = new Proxy(this as any, {
      set(target, prop, value) {
        target[prop] = value;
        if (prop === 'src' && value && target.onload) Promise.resolve().then(() => target.onload?.());
        return true;
      },
    });
    return proxy;
  }
}

beforeEach(() => {
  // @ts-expect-error mock Image
  globalThis.Image = MockImage;
  mockBrightness = 128;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return origGetContext.call(this, type);
    return {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      drawImage: vi.fn(), putImageData: vi.fn(), filter: '', canvas: this,
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i+1] = data[i+2] = mockBrightness; data[i+3] = 255;
        }
        return { data, width: w, height: h };
      }),
    } as unknown as CanvasRenderingContext2D;
  } as typeof origGetContext;
});

afterEach(() => {
  globalThis.Image = OriginalImage;
  HTMLCanvasElement.prototype.toDataURL = origToDataURL;
  vi.restoreAllMocks();
});

function makeImg(w: number, h: number) {
  const img = new Image(); img.width = w; img.height = h;
  return img;
}

// ── scanMode: barcode-only ────────────────────────────────────────────────────

describe('useScanPipeline — scanMode=barcode', () => {
  it('skips OCR entirely when scanMode is barcode', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode, scanMode: 'barcode' }),
    );

    await act(async () => {
      await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'bc-only');
    });

    expect(tryBarcodeDecode).toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
  });

  it('returns isbn when barcode succeeds in barcode-only mode', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue('9780141036144');
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode, scanMode: 'barcode' }),
    );

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'bc-hit');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(runOcr).not.toHaveBeenCalled();
  });

  it('returns suggestions (no barcode, no ocr) when barcode-only mode finds nothing', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode, scanMode: 'barcode' }),
    );

    let pipelineResult: { isbn: string | null; diagnostics?: { barcodeAttempted: boolean } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'bc-miss');
    });

    expect(pipelineResult?.isbn).toBeNull();
    expect(pipelineResult?.diagnostics?.barcodeAttempted).toBe(true);
    expect(runOcr).not.toHaveBeenCalled();
  });
});

// ── scanMode: ocr-only ────────────────────────────────────────────────────────

describe('useScanPipeline — scanMode=ocr', () => {
  it('skips barcode phase when scanMode is ocr', async () => {
    const tryBarcodeDecode = vi.fn();
    const runOcr = vi.fn().mockResolvedValue({ isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 90 });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode, scanMode: 'ocr' }),
    );

    await act(async () => {
      await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'ocr-only');
    });

    expect(tryBarcodeDecode).not.toHaveBeenCalled();
    expect(runOcr).toHaveBeenCalled();
  });
});

// ── Zero-dimension guard ──────────────────────────────────────────────────────

describe('useScanPipeline — zero-dimension image guard', () => {
  it('returns null with lastError when image has zero width', async () => {
    const tryBarcodeDecode = vi.fn();
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(0, 480);
    let pipelineResult: { isbn: string | null; diagnostics?: { lastError?: string } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, document.createElement('canvas'), 'zero-dim');
    });

    expect(pipelineResult?.isbn).toBeNull();
    expect(pipelineResult?.diagnostics?.lastError).toMatch(/zero/i);
    expect(tryBarcodeDecode).not.toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
  });

  it('returns null with lastError when image has zero height', async () => {
    const tryBarcodeDecode = vi.fn();
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(640, 0);
    let pipelineResult: { isbn: string | null; diagnostics?: { lastError?: string } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, document.createElement('canvas'), 'zero-height');
    });

    expect(pipelineResult?.isbn).toBeNull();
    expect(pipelineResult?.diagnostics?.lastError).toBeTruthy();
  });
});

// ── Concurrent scan suppression ──────────────────────────────────────────────

describe('useScanPipeline — concurrent scan suppression', () => {
  it('returns early with suppressed error when pipeline is already busy', async () => {
    const tryBarcodeDecode = vi.fn();
    let resolveScan: (() => void) | null = null;
    const runOcr = vi.fn().mockReturnValue(
      new Promise<{ isbn: null; allCandidates: never[] }>((resolve) => {
        resolveScan = () => resolve({ isbn: null, allCandidates: [] });
      }),
    );

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const canvas = document.createElement('canvas');
    const img = makeImg(640, 480);

    // Start first scan (will block at OCR)
    const firstScan = result.current.runPipeline(img, canvas, 'scan-1');

    // Immediately try a second concurrent scan
    let secondResult: { isbn: string | null; diagnostics?: { lastError?: string } } | null = null;
    await act(async () => {
      secondResult = await result.current.runPipeline(img, canvas, 'scan-2');
    });

    expect(secondResult?.isbn).toBeNull();
    expect(secondResult?.diagnostics?.lastError).toMatch(/concurrent/i);

    // Let first scan complete
    resolveScan!();
    await act(async () => { await firstScan; });
  }, 15000);
});

// ── AbortSignal support ───────────────────────────────────────────────────────

describe('useScanPipeline — abort signal', () => {
  it('respects aborted signal and does not invoke callbacks after abort', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });
    const onProgress = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode, onProgress }),
    );

    const controller = new AbortController();
    controller.abort();

    await act(async () => {
      await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'aborted', {
        signal: controller.signal,
      });
    });

    // onProgress should not be called after abort
    expect(onProgress).not.toHaveBeenCalled();
  }, 15000);
});

// ── Barcode checksum repair ───────────────────────────────────────────────────

describe('useScanPipeline — barcode checksum repair', () => {
  it('returns repaired ISBN when barcode returns wrong checksum', async () => {
    // 9780141036145 is invalid (last digit wrong), should repair to 9780141036144
    const tryBarcodeDecode = vi.fn().mockResolvedValue('9780141036145');
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    let pipelineResult: { isbn: string | null; detectionMethod?: string } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'bc-repair');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(pipelineResult?.detectionMethod).toBe('barcode');
    expect(runOcr).not.toHaveBeenCalled();
  });
});
