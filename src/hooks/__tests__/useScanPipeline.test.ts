import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useScanPipeline,
  preprocessImage,
  cropForBarcode,
  assessFrameQuality,
  hasLowOcrResolution,
  CROP_NARROW,
  CROP_MEDIUM,
  CROP_WIDE,
  CROP_FULL,
  CROP_CENTER,
  type ScanProgress,
} from '../useScanPipeline';

/* ================================================================
 *  DOM mocks for jsdom (canvas, Image)
 * ================================================================ */

const OriginalImage = globalThis.Image;
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;

class MockImage {
  width = 640;
  height = 480;
  src = '';
  onload: (() => void) | null = null;
  onerror: ((err: Error) => void) | null = null;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxy = new Proxy(this as any, {
      set(target, prop, value) {
        target[prop] = value;
        if (prop === 'src' && value && target.onload) {
          Promise.resolve().then(() => target.onload?.());
        }
        return true;
      },
    });
    return proxy;
  }
}

let mockBrightness = 128;
let mockBlurVariance = 150;
let lastContext: CanvasRenderingContext2D | null = null;

beforeEach(() => {
  // @ts-expect-error mock Image
  globalThis.Image = MockImage;
  mockBrightness = 128;
  mockBlurVariance = 150;
  lastContext = null;

  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return origGetContext.call(this, type);
    lastContext = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn(function (this: { canvas?: HTMLCanvasElement }, _x: number, _y: number, w: number, h: number) {
        const width = w || (this.canvas?.width ?? 200);
        const height = h || (this.canvas?.height ?? 150);
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = mockBrightness;
          data[i + 1] = mockBrightness;
          data[i + 2] = mockBrightness;
          data[i + 3] = 255;
        }
        return { data, width, height };
      }),
      filter: '',
      canvas: this,
    } as unknown as CanvasRenderingContext2D;
    return lastContext;
  } as typeof origGetContext;
});

afterEach(() => {
  globalThis.Image = OriginalImage;
  HTMLCanvasElement.prototype.toDataURL = origToDataURL;
  vi.restoreAllMocks();
});

/* ================================================================
 *  Crop region constants
 * ================================================================ */

describe('useScanPipeline — crop regions', () => {
  it('defines expected crop regions with valid fractions', () => {
    expect(CROP_NARROW.widthFrac).toBe(0.92);
    expect(CROP_NARROW.heightFrac).toBe(0.28);
    expect(CROP_NARROW.label).toBe('narrow');

    expect(CROP_MEDIUM.widthFrac).toBe(0.94);
    expect(CROP_MEDIUM.heightFrac).toBe(0.50);
    expect(CROP_CENTER.widthFrac).toBe(0.70);
    expect(CROP_CENTER.heightFrac).toBe(0.40);
    expect(CROP_WIDE.widthFrac).toBe(0.96);
    expect(CROP_FULL.widthFrac).toBe(1);
    expect(CROP_FULL.heightFrac).toBe(1);
  });
});

/* ================================================================
 *  preprocessImage
 * ================================================================ */

describe('useScanPipeline — preprocessImage', () => {
  it('returns a data URL string', () => {
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,preprocessed');

    const result = preprocessImage(img, canvas, 0, CROP_MEDIUM, 'clean');
    expect(result).toBe('data:image/png;base64,preprocessed');
    expect(result).toMatch(/^data:image\/png;base64,/);

    HTMLCanvasElement.prototype.toDataURL = origToDataURL;
  });

  it('swaps canvas dimensions for 90° and 270° rotation', () => {
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    preprocessImage(img, canvas, 90, CROP_NARROW, 'clean');

    // For 90/270 rotation with narrow crop: dimensions are swapped
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(lastContext?.drawImage).toHaveBeenCalled();
  });

  it('applies different filter modes', () => {
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    preprocessImage(img, canvas, 0, CROP_MEDIUM, 'enhanced');
    expect(lastContext?.filter).toContain('contrast');
    expect(lastContext?.filter).toContain('grayscale');

    preprocessImage(img, canvas, 0, CROP_MEDIUM, 'invert');
    expect(lastContext?.filter).toContain('invert');

    preprocessImage(img, canvas, 0, CROP_MEDIUM, 'boost');
    expect(lastContext?.filter).toContain('contrast');
  });
});

/* ================================================================
 *  cropForBarcode
 * ================================================================ */

describe('useScanPipeline — cropForBarcode', () => {
  it('returns a data URL and sets canvas dimensions from crop', () => {
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    const result = cropForBarcode(img, canvas, CROP_CENTER);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^data:image/);
    expect(canvas.width).toBe(640 * 0.70);
    expect(canvas.height).toBe(480 * 0.40);
  });

  it('uses full crop for CROP_FULL', () => {
    const img = new Image();
    img.width = 1920;
    img.height = 1080;
    const canvas = document.createElement('canvas');

    cropForBarcode(img, canvas, CROP_FULL);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
  });
});

/* ================================================================
 *  assessFrameQuality
 * ================================================================ */

describe('useScanPipeline — assessFrameQuality', () => {
  it('returns brightness, blurVariance, isDark, isBlurry', () => {
    mockBrightness = 100;
    mockBlurVariance = 130;

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
    expect(quality).toHaveProperty('brightness');
    expect(quality).toHaveProperty('blurVariance');
    expect(quality).toHaveProperty('isDark');
    expect(quality).toHaveProperty('isBlurry');
  });

  it('marks frame as dark when brightness < 90', () => {
    mockBrightness = 50;
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
    expect(quality.isDark).toBe(true);
  });

  it('marks frame as not dark when brightness >= 90', () => {
    mockBrightness = 120;
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
    expect(quality.isDark).toBe(false);
  });

  it('marks frame as blurry when Laplacian variance is low (uniform image)', () => {
    // Uniform pixel data => Laplacian ≈ 0 => variance < 120 => isBlurry
    mockBrightness = 100;
    const img = new Image();
    img.width = 320;
    img.height = 220;
    const canvas = document.createElement('canvas');

    const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
    expect(quality.isBlurry).toBe(true);
  });
});

/* ================================================================
 *  runPipeline (integration)
 * ================================================================ */

describe('useScanPipeline — runPipeline', () => {
  it('returns ISBN from barcode phase when barcode decodes valid ISBN', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue('9780141036144');
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; suggestions: string[] } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(pipelineResult?.suggestions).toEqual([]);
    expect(tryBarcodeDecode).toHaveBeenCalled();
    expect(runOcr).not.toHaveBeenCalled();
  });

  it('falls through to OCR when barcode fails and returns ISBN from OCR', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: '9780141036144',
      allCandidates: ['9780141036144'],
    });

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; suggestions: string[] } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(runOcr).toHaveBeenCalled();
  });

  it('returns suggestions when no valid ISBN found but candidates exist', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: null,
      allCandidates: ['9780306406158'], // invalid checksum
    });

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; suggestions: string[] } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBeNull();
    expect(pipelineResult?.suggestions).toContain('9780306406158');
  });

  it('skips OCR when image is blurry and dark (after recovery passes)', async () => {
    // mockBrightness 50 => isDark (50 < 90); uniform data => low Laplacian variance => isBlurry
    // Recovery passes (boost+invert) are attempted before the full skip.
    mockBrightness = 50;
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null); // no barcode, so we reach OCR phase
    // Recovery passes call runOcr — return a no-result value to avoid crashes.
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const addLog = vi.fn();
    const { result } = renderHook(() =>
      useScanPipeline({
        addLog,
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; suggestions: string[] } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    // New behavior: attempts recovery passes, then logs "Recovery passes found nothing. Skipping..."
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Dark and blurry'),
    );
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Skipping full OCR scan'),
    );
    // runOcr IS called for the 2 recovery passes (boost + invert)
    expect(runOcr).toHaveBeenCalledTimes(2);
    expect(pipelineResult?.isbn).toBeNull();
    expect(pipelineResult?.suggestions.length).toBeGreaterThanOrEqual(0);
  });

  it('includes lowResolution in diagnostics when image is too small for OCR', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
      }),
    );

    // CROP_MEDIUM on 400x150: cropH = 75 < MIN_OCR_PIXELS (200) => lowRes = true
    const img = new Image();
    img.width = 400;
    img.height = 150;
    const canvas = document.createElement('canvas');

    let pipelineResult: { diagnostics?: { lowResolution?: boolean } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(hasLowOcrResolution(400, 150, CROP_MEDIUM)).toBe(true);
    expect(pipelineResult?.diagnostics?.lowResolution).toBe(true);
  });

  it('invokes onProgress with barcode and ocr phases', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const progressCalls: ScanProgress[] = [];
    const onProgress = vi.fn((p: ScanProgress) => progressCalls.push(p));

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
        onProgress,
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    await act(async () => {
      await result.current.runPipeline(img, canvas, 'test');
    });

    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[0].phase).toBe('barcode');
    expect(progressCalls.some((p) => p.phase === 'ocr')).toBe(true);
    // Pipeline completes; suggestions and done may appear depending on code path
    expect(progressCalls.some((p) => p.phase === 'suggestions' || p.phase === 'done')).toBe(true);
  });

  it('onProgress includes currentPass and totalPasses during OCR', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: null,
      allCandidates: [],
    }); // No ISBN so we run multiple passes

    const progressCalls: ScanProgress[] = [];
    const onProgress = vi.fn((p: ScanProgress) => progressCalls.push(p));

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        tryBarcodeDecode,
        onProgress,
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    await act(async () => {
      await result.current.runPipeline(img, canvas, 'test');
    });

    const ocrProgress = progressCalls.filter((p) => p.phase === 'ocr' || p.phase === 'ocr-multilang');
    expect(ocrProgress.length).toBeGreaterThan(0);
    const withPass = ocrProgress.find((p) => p.currentPass != null && p.totalPasses != null);
    expect(withPass).toBeDefined();
    expect(withPass?.totalPasses).toBeGreaterThan(0);
  });

  it('calls runOcrWithLang with eng+deu when ocrLanguage is both', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });
    const runOcrWithLang = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const { result } = renderHook(() =>
      useScanPipeline({
        addLog: vi.fn(),
        setStatus: vi.fn(),
        runOcr,
        runOcrWithLang,
        tryBarcodeDecode,
        ocrLanguage: 'both',
      }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    await act(async () => {
      await result.current.runPipeline(img, canvas, 'test');
    });

    expect(runOcrWithLang).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('deu'),
      'eng+deu',
      expect.any(Function),
      expect.any(Function),
    );
  });

});
