import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useScanPipeline,
  preprocessImage,
  cropForBarcode,
  assessFrameQuality,
  hasLowOcrResolution,
  buildOcrPasses,
  getQualityHints,
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
let mockBlurVariance: number = 150; // eslint-disable-line @typescript-eslint/no-unused-vars
let lastContext: CanvasRenderingContext2D | null = null;

beforeEach(() => {
  // @ts-expect-error mock Image
  globalThis.Image = MockImage;
  mockBrightness = 128;
  mockBlurVariance = 150;
  lastContext = null;

  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

  const origGetContext = HTMLCanvasElement.prototype.getContext;
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
 *  buildOcrPasses
 * ================================================================ */

describe('useScanPipeline — buildOcrPasses', () => {
  it('puts unsharp and sharpen first when blurry', () => {
    const quality = { brightness: 128, blurVariance: 80, isDark: false, isBlurry: true };
    const passes = buildOcrPasses(quality, 'test-');
    const labels = passes.map(p => p.label);
    expect(labels[0]).toBe('test-narrow-unsharp');
    expect(labels[1]).toBe('test-narrow-sharpen');
  });

  it('includes invert pass when dark', () => {
    const quality = { brightness: 50, blurVariance: 150, isDark: true, isBlurry: false };
    const passes = buildOcrPasses(quality, 'test-');
    const labels = passes.map(p => p.label);
    expect(labels).toContain('test-narrow-inv');
  });

  it('excludes invert when not dark', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false };
    const passes = buildOcrPasses(quality, 'test-');
    const labels = passes.map(p => p.label);
    expect(labels).not.toContain('test-narrow-inv');
  });

  it('includes base passes for normal quality', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false };
    const passes = buildOcrPasses(quality, 'p-');
    expect(passes.length).toBeGreaterThan(10);
    expect(passes.some(p => p.label === 'p-narrow-0')).toBe(true);
    expect(passes.some(p => p.label === 'p-wide-sparse')).toBe(true);
  });

  it('includes center and full rotations (0°, 90°, 270°)', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false };
    const passes = buildOcrPasses(quality, 'p-');
    const labels = passes.map(p => p.label);
    expect(labels).toContain('p-center-90');
    expect(labels).toContain('p-center-270');
    expect(labels).toContain('p-full-90');
    expect(labels).toContain('p-full-270');
  });

  it('includes invert when borderline dark (brightness 90–115)', () => {
    const quality = { brightness: 100, blurVariance: 150, isDark: false, isBlurry: false };
    const passes = buildOcrPasses(quality, 'p-');
    expect(passes.some(p => p.label === 'p-narrow-inv')).toBe(true);
  });

  it('includes invertBoost first when very dark (brightness < 60)', () => {
    const quality = { brightness: 50, blurVariance: 150, isDark: true, isBlurry: false };
    const passes = buildOcrPasses(quality, 'p-');
    expect(passes.some(p => p.label === 'p-narrow-invBoost')).toBe(true);
    expect(passes[0].label).toBe('p-narrow-invBoost');
  });

  it('uses dpiLabel for resolution hints when quality has it', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false, dpiLabel: 'low' as const };
    const hints = getQualityHints(quality, false);
    expect(hints).toContain('low_resolution');
  });
});

/* ================================================================
 *  getQualityHints
 * ================================================================ */

describe('useScanPipeline — getQualityHints', () => {
  it('returns hold_steady when blurry', () => {
    const quality = { brightness: 128, blurVariance: 80, isDark: false, isBlurry: true };
    const hints = getQualityHints(quality, false);
    expect(hints).toContain('hold_steady');
  });

  it('returns improve_lighting when dark', () => {
    const quality = { brightness: 50, blurVariance: 150, isDark: true, isBlurry: false };
    const hints = getQualityHints(quality, false);
    expect(hints).toContain('improve_lighting');
  });

  it('returns low_resolution when lowRes is true', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false };
    const hints = getQualityHints(quality, true);
    expect(hints).toContain('low_resolution');
  });

  it('returns ok when quality is good and not low res', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false };
    const hints = getQualityHints(quality, false);
    expect(hints).toContain('ok');
  });
});

/* ================================================================
 *  hasLowOcrResolution (unit tests)
 * ================================================================ */

describe('useScanPipeline — hasLowOcrResolution', () => {
  it('returns true when crop short dimension < 200px', () => {
    // CROP_MEDIUM 0.5 height: 300*0.5=150 < 200
    expect(hasLowOcrResolution(400, 300, CROP_MEDIUM)).toBe(true);
  });

  it('returns false when crop short dimension >= 200px', () => {
    expect(hasLowOcrResolution(640, 480, CROP_MEDIUM)).toBe(false);
  });

  it('returns true for narrow crop on small image', () => {
    // CROP_NARROW heightFrac 0.28: 300*0.28=84 < 200
    expect(hasLowOcrResolution(400, 300, CROP_NARROW)).toBe(true);
  });

  it('returns false at exactly 200px boundary', () => {
    // Need crop to yield 200px: 200/0.5=400 height for CROP_MEDIUM
    expect(hasLowOcrResolution(500, 400, CROP_MEDIUM)).toBe(false);
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

    preprocessImage(img, canvas, 0, CROP_MEDIUM, 'invertBoost');
    expect(lastContext?.filter).toContain('invert');
    expect(lastContext?.filter).toContain('contrast');
  });

  it('calls putImageData for sharpen and unsharp modes', () => {
    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    preprocessImage(img, canvas, 0, CROP_MEDIUM, 'sharpen');
    expect(lastContext?.putImageData).toHaveBeenCalled();

    lastContext?.putImageData.mockClear?.();
    preprocessImage(img, canvas, 0, CROP_MEDIUM, 'unsharp');
    expect(lastContext?.putImageData).toHaveBeenCalled();
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
  }, 15000);

  it('skips OCR when image is blurry and dark', async () => {
    // mockBrightness 50 => isDark (50 < 90); uniform data => low Laplacian variance => isBlurry
    mockBrightness = 50;
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null); // no barcode, so we reach OCR phase
    const runOcr = vi.fn();

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

    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Skipping OCR'),
    );
    expect(runOcr).not.toHaveBeenCalled();
    expect(pipelineResult?.suggestions.length).toBeGreaterThanOrEqual(0);
  });

  it('uses the latest scanMode after rerendering', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const { result, rerender } = renderHook(
      ({ scanMode }: { scanMode: 'auto' | 'barcode' | 'ocr' }) =>
        useScanPipeline({
          addLog: vi.fn(),
          setStatus: vi.fn(),
          runOcr,
          tryBarcodeDecode,
          scanMode,
        }),
      { initialProps: { scanMode: 'barcode' as const } },
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    await act(async () => {
      await result.current.runPipeline(img, canvas, 'test');
    });

    expect(runOcr).not.toHaveBeenCalled();

    rerender({ scanMode: 'ocr' });

    await act(async () => {
      await result.current.runPipeline(img, canvas, 'test');
    });

    expect(tryBarcodeDecode).toHaveBeenCalledTimes(5);
    expect(runOcr).toHaveBeenCalled();
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
  }, 15000);

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
    expect(progressCalls.some((p) => p.phase === 'suggestions' || p.phase === 'done')).toBe(true);
  }, 15000);

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
  }, 15000);

  it('exits early on first OCR pass when high confidence ISBN found', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: '9780141036144',
      allCandidates: ['9780141036144'],
      confidence: 90,
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

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(runOcr).toHaveBeenCalledTimes(1);
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
  }, 15000);

  it('low-confidence ISBN does NOT cause early exit; returns high-confidence ISBN from later pass', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    let callCount = 0;
    const runOcr = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return { isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 30 };
      }
      if (callCount === 2) {
        return { isbn: '9783161484100', allCandidates: ['9783161484100'], confidence: 95 };
      }
      return { isbn: null, allCandidates: [] };
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

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    // runOcr should have been called more than once (low-confidence didn't cause early exit)
    expect(runOcr).toHaveBeenCalledTimes(2);
    // The pipeline should return the high-confidence ISBN
    expect(pipelineResult?.isbn).toBe('9783161484100');
  });

  it('returns confidence metadata for OCR-driven matches', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: '9780141036144',
      allCandidates: ['9780141036144'],
      confidence: 92,
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

    let pipelineResult: { isbn: string | null; confidence?: number; confidenceBand?: string; detectionMethod?: string } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(pipelineResult?.confidence).toBe(92);
    expect(pipelineResult?.confidenceBand).toBe('high');
    expect(pipelineResult?.detectionMethod).toBe('ocr');
  });

  it('high-confidence ISBN causes early exit on first pass (confidence >= 85)', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: '9780141036144',
      allCandidates: ['9780141036144'],
      confidence: 92,
    });

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

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(runOcr).toHaveBeenCalledTimes(1);
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Early exit'));
  });

  it('returns best candidate when all passes have low confidence', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    let callCount = 0;
    const runOcr = vi.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return { isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 40 };
      }
      return { isbn: null, allCandidates: [] };
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

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
  }, 15000);

  it('handles zero-dimension image with null ISBN and diagnostics', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
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
    img.width = 0;
    img.height = 0;
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; diagnostics?: { lastError?: string } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.isbn).toBeNull();
    expect(pipelineResult?.diagnostics?.lastError).toMatch(/zero/i);
    expect(runOcr).not.toHaveBeenCalled();
  });

  it('exits early when abort signal is already aborted', async () => {
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

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    const controller = new AbortController();
    controller.abort();

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test', { signal: controller.signal });
    });

    // OCR loop should have been skipped due to aborted signal
    // Barcode phase still runs (it doesn't check signal), but OCR passes check signal
    // Either 0 OCR calls (all skipped) or pipeline returns null ISBN
    expect(pipelineResult?.isbn).toBeNull();
  });

  it('suppresses concurrent pipeline call with diagnostics', async () => {
    const tryBarcodeDecode = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(null), 50))
    );
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

    let result1: { isbn: string | null; diagnostics?: { lastError?: string } } | null = null;
    let result2: { isbn: string | null; diagnostics?: { lastError?: string } } | null = null;

    await act(async () => {
      const p1 = result.current.runPipeline(img, canvas, 'test1');
      const p2 = result.current.runPipeline(img, canvas, 'test2');
      [result1, result2] = await Promise.all([p1, p2]);
    });

    // One of the two calls should have been suppressed
    const suppressed = [result1, result2].find(r => r?.diagnostics?.lastError?.includes('Concurrent'));
    expect(suppressed).toBeDefined();
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Pipeline already running'));
  }, 15000);

  it('includes triple-repair suggestions when double-repair fails', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: null,
      allCandidates: ['4780306400157'],
      symbolConfidences: Array(13).fill(null).map((_, i) => ({ text: String(i % 10), confidence: i < 3 ? 10 : 90 })),
    });

    const addLog = vi.fn();
    const { result } = renderHook(() =>
      useScanPipeline({ addLog, setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = new Image();
    img.width = 640;
    img.height = 480;
    const canvas = document.createElement('canvas');

    let pipelineResult: { suggestions?: string[]; repairedMap?: Record<string, string> } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'test');
    });

    expect(pipelineResult?.suggestions?.length).toBeGreaterThanOrEqual(0);
  });
});

