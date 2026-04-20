/**
 * Phase 25 — Scan Accuracy Regression Fixtures
 *
 * These tests encode the difficult scan scenarios identified in NEXT_STEPS.md
 * and ZXING_BARCODE_DETECTION_REPORT.md so regressions are caught before
 * shipping changes to the scan pipeline.
 *
 * Each fixture simulates a known-hard scenario by controlling image quality
 * parameters (brightness, blur, resolution) and asserting on pipeline behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useScanPipeline,
  assessFrameQuality,
  buildOcrPasses,
  hasLowOcrResolution,
  CROP_MEDIUM,
  CROP_NARROW,
} from '../useScanPipeline';

// ── DOM mocks (mirrors setup in useScanPipeline.test.ts) ──────────────────────

const OriginalImage = globalThis.Image;
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;

let mockBrightness = 128;

class MockImage {
  width = 640;
  height = 480;
  src = '';
  onload: (() => void) | null = null;

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

beforeEach(() => {
  // @ts-expect-error mock Image
  globalThis.Image = MockImage;
  mockBrightness = 128;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return origGetContext.call(this, type);
    return {
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
  } as typeof origGetContext;
});

afterEach(() => {
  globalThis.Image = OriginalImage;
  HTMLCanvasElement.prototype.toDataURL = origToDataURL;
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeImg(width: number, height: number) {
  const img = new Image();
  img.width = width;
  img.height = height;
  return img;
}

// ── Fixture: dim-light capture ────────────────────────────────────────────────

describe('Regression fixture — dim-light capture', () => {
  it('assessFrameQuality marks frame as dark when brightness is 45', () => {
    mockBrightness = 45;
    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');
    const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
    expect(quality.isDark).toBe(true);
  });

  it('buildOcrPasses prioritises invertBoost for very dark frames (brightness < 60)', () => {
    const quality = { brightness: 45, blurVariance: 150, isDark: true, isBlurry: false };
    const passes = buildOcrPasses(quality, 'dim-');
    expect(passes[0].label).toBe('dim-narrow-invBoost');
  });

  it('pipeline returns diagnostics indicating OCR was skipped when both blurry and dark', async () => {
    mockBrightness = 45;
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn();

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; diagnostics?: { skipReason?: string } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'dim-light');
    });

    expect(pipelineResult?.isbn).toBeNull();
    expect(runOcr).not.toHaveBeenCalled();
    expect(pipelineResult?.diagnostics?.skipReason).toBeTruthy();
  });
});

// ── Fixture: glossy cover / glare ─────────────────────────────────────────────

describe('Regression fixture — glossy cover (over-exposed)', () => {
  it('assessFrameQuality correctly measures high-brightness (over-exposed) frame', () => {
    mockBrightness = 240;
    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');
    const quality = assessFrameQuality(img, canvas, CROP_MEDIUM);
    // Very bright frame should NOT be flagged as dark
    expect(quality.isDark).toBe(false);
    expect(quality.brightness).toBeGreaterThan(200);
  });

  it('buildOcrPasses does not include invert for bright frames', () => {
    const quality = { brightness: 240, blurVariance: 150, isDark: false, isBlurry: false };
    const passes = buildOcrPasses(quality, 'glare-');
    const labels = passes.map(p => p.label);
    // invert pass would worsen already-bright images
    expect(labels).not.toContain('glare-narrow-inv');
    expect(labels).not.toContain('glare-narrow-invBoost');
  });

  it('pipeline attempts OCR on glossy/bright image and returns suggestions or null', async () => {
    mockBrightness = 240;
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: ['9780000000002'] });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; suggestions: string[] } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'glossy');
    });

    // Should attempt OCR (not skip it)
    expect(runOcr).toHaveBeenCalled();
    // Result can be null or a suggestion depending on checksum
    expect(pipelineResult).not.toBeNull();
  }, 15000);
});

// ── Fixture: partial / truncated barcode ──────────────────────────────────────

describe('Regression fixture — partial barcode (barcode fails, OCR attempted)', () => {
  it('pipeline falls through to OCR when barcode decode returns null', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');

    await act(async () => {
      await result.current.runPipeline(img, canvas, 'partial-barcode');
    });

    expect(tryBarcodeDecode).toHaveBeenCalled();
    expect(runOcr).toHaveBeenCalled();
  }, 15000);

  it('pipeline returns repaired ISBN when single-digit OCR error produces invalid checksum', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    // OCR misreads last digit: 9780141036144 → 9780141036145 (invalid)
    const runOcr = vi.fn().mockResolvedValue({
      isbn: null,
      allCandidates: ['9780141036145'],
    });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null; suggestions: string[]; repairedMap?: Record<string, string> } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'partial-barcode-repair');
    });

    // Pipeline should offer the repaired ISBN as a suggestion
    expect(pipelineResult?.suggestions).toContain('9780141036144');
  }, 15000);
});

// ── Fixture: rotated spine ─────────────────────────────────────────────────────

describe('Regression fixture — rotated spine (vertical text)', () => {
  it('buildOcrPasses includes 90° and 270° rotation passes for normal quality', () => {
    const quality = { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false };
    const passes = buildOcrPasses(quality, 'rot-');
    const labels = passes.map(p => p.label);
    expect(labels).toContain('rot-center-90');
    expect(labels).toContain('rot-center-270');
    expect(labels).toContain('rot-full-90');
    expect(labels).toContain('rot-full-270');
  });

  it('pipeline returns ISBN when OCR detects it on 90° rotation pass', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    let callCount = 0;
    const runOcr = vi.fn().mockImplementation(async (_data: string, _passLabel: unknown) => {
      callCount++;
      // Simulate success only on a rotation pass (simplified: succeed on 3rd call)
      if (callCount === 3) {
        return { isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 88 };
      }
      return { isbn: null, allCandidates: [] };
    });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(640, 480);
    const canvas = document.createElement('canvas');

    let pipelineResult: { isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'rotated-spine');
    });

    expect(pipelineResult?.isbn).toBe('9780141036144');
    expect(runOcr).toHaveBeenCalledTimes(3);
  });
});

// ── Fixture: low-resolution / move-closer ─────────────────────────────────────

describe('Regression fixture — low-resolution capture (too far from book)', () => {
  it('hasLowOcrResolution returns true for 400×300 image with CROP_MEDIUM', () => {
    expect(hasLowOcrResolution(400, 300, CROP_MEDIUM)).toBe(true);
  });

  it('hasLowOcrResolution returns true for 300×200 image with CROP_NARROW', () => {
    expect(hasLowOcrResolution(300, 200, CROP_NARROW)).toBe(true);
  });

  it('pipeline includes lowResolution flag in diagnostics for tiny image', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const img = makeImg(300, 150);
    const canvas = document.createElement('canvas');

    let pipelineResult: { diagnostics?: { lowResolution?: boolean } } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(img, canvas, 'low-res');
    });

    expect(pipelineResult?.diagnostics?.lowResolution).toBe(true);
  }, 15000);

  it('hasLowOcrResolution returns false for full HD camera (1920×1080)', () => {
    expect(hasLowOcrResolution(1920, 1080, CROP_MEDIUM)).toBe(false);
  });
});

// ── Fixture: confidence band mapping ─────────────────────────────────────────

describe('Regression fixture — OCR confidence band output', () => {
  it('returns confidenceBand="high" for confidence >= 85', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: '9780141036144',
      allCandidates: ['9780141036144'],
      confidence: 87,
    });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    let pipelineResult: { confidenceBand?: string } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'conf-high');
    });

    expect(pipelineResult?.confidenceBand).toBe('high');
  }, 20000);

  it('returns confidenceBand="medium" for confidence in 60–84 range', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    const runOcr = vi.fn().mockResolvedValue({
      isbn: '9780141036144',
      allCandidates: ['9780141036144'],
      confidence: 70,
    });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    let pipelineResult: { confidenceBand?: string } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'conf-med');
    });

    expect(pipelineResult?.confidenceBand).toBe('medium');
  }, 20000);

  it('returns confidenceBand="low" for confidence below 60', async () => {
    const tryBarcodeDecode = vi.fn().mockResolvedValue(null);
    let called = false;
    const runOcr = vi.fn().mockImplementation(async () => {
      if (!called) {
        called = true;
        return { isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 35 };
      }
      return { isbn: null, allCandidates: [] };
    });

    const { result } = renderHook(() =>
      useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    let pipelineResult: { confidenceBand?: string; isbn: string | null } | null = null;
    await act(async () => {
      pipelineResult = await result.current.runPipeline(makeImg(640, 480), document.createElement('canvas'), 'conf-low');
    });

    // Low confidence: pipeline continues but ultimately returns best candidate
    expect(pipelineResult?.confidenceBand).toBe('low');
  }, 20000);
});
