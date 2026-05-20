/**
 * Phase 25 — Scan pipeline CSV benchmark under Vitest jsdom (same DOM stubs as scanRegressionFixtures.test.ts).
 *
 * Env:
 * - SCAN_BENCHMARK_RUNS — repeating each fixture for timing stability (default 10)
 * - SCAN_BENCHMARK_DEVICE — label column (default hostname)
 * - SCAN_BENCHMARK_OUT — optional CSV + footer file path
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { OcrResult } from '../useOcrEngine.ts';
import { useScanPipeline, type ScanPipelineResult } from '../useScanPipeline.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RUN_BENCHMARK_FLAG = !!process.env.RUN_SCAN_BENCHMARK;
const RUN_ID = new Date().toISOString();
const DEVICE = process.env.SCAN_BENCHMARK_DEVICE ?? hostname();
/** When not running benchmark: repeats=1 for fast gated describe.skip; real runs override via SCAN_BENCHMARK_RUNS. */
const REPEATS = RUN_BENCHMARK_FLAG
  ? Math.max(1, parseInt(process.env.SCAN_BENCHMARK_RUNS ?? '10', 10) || 10)
  : 1;
const OUT_PATH = process.env.SCAN_BENCHMARK_OUT;

type OcrFnArgs = Parameters<Parameters<typeof useScanPipeline>[0]['runOcr']>;

type RunOcrImpl = (...args: OcrFnArgs) => Promise<OcrResult>;

interface FixtureCtx {
  id: string;
  brightness: number;
  imgWidth: number;
  imgHeight: number;
  buildTryBarcodeDecode: () => RunTypeBarcode;
  /** Returns the runOcr implementation wired into the spy each repeat. */
  buildRunOcr: () => RunOcrImpl;
  assert?: (args: ScanPipelineResult & { ocrCalls: number }) => void;
}

type RunTypeBarcode = (img: HTMLImageElement | string, label: string) => Promise<string | null>;

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function methodLabel(result: ScanPipelineResult): string {
  if (result.detectionMethod === 'barcode') return 'barcode';
  if (result.detectionMethod === 'ocr' || result.detectionMethod === 'ocr-multilang') return 'ocr';
  if ((result.diagnostics?.ocrPassesAttempted ?? 0) > 0) return 'ocr';
  return 'none';
}

// ── DOM mocks (copy of scanRegressionFixtures.test.ts) ─────────────────────────

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
        target[prop as string] = value;
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
  // @ts-expect-error mock Image constructor for synthetic frames
  globalThis.Image = MockImage;
  mockBrightness = 128;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...rest: unknown[]
  ) {
    if (type !== '2d') return origGetContext.call(this, type as never, ...(rest as never[]));
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

function makeImg(width: number, height: number): HTMLImageElement {
  const img = new Image();
  img.width = width;
  img.height = height;
  return img;
}

function emptyRunOcr(): RunOcrImpl {
  return async (..._args: OcrFnArgs): Promise<OcrResult> => ({ isbn: null, allCandidates: [] });
}

const benchDescribe = RUN_BENCHMARK_FLAG ? describe : describe.skip;

benchDescribe('benchmark:scan runner', () => {
  it(
    'writes CSV (+ aggregates) aligned with regression fixtures',
    async () => {
      const fixtures: FixtureCtx[] = [
        {
          id: 'dim-light-blurry-dark-skip',
          brightness: 45,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => emptyRunOcr(),
          assert: ({ isbn, ocrCalls }) => {
            expect(isbn, 'skip path').toBeNull();
            expect(ocrCalls, 'OCR suppressed when blurry+dark').toBe(0);
          },
        },
        {
          id: 'glossy-overexposed-ocr-path',
          brightness: 240,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => async (..._args: OcrFnArgs): Promise<OcrResult> => ({ isbn: null, allCandidates: ['9780000000002'] }),
          assert: ({ ocrCalls }) => expect(ocrCalls).toBeGreaterThan(0),
        },
        {
          id: 'partial-barcode-repair-suggestion',
          brightness: 128,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => async (..._args: OcrFnArgs): Promise<OcrResult> => ({
            isbn: null,
            allCandidates: ['9780141036145'],
          }),
          assert: ({ suggestions }) => expect(suggestions).toContain('9780141036144'),
        },
        {
          id: 'rotated-spine-isbn-pass-3',
          brightness: 128,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => {
            let calls = 0;
            return async (..._args: OcrFnArgs): Promise<OcrResult> => {
              calls += 1;
              if (calls === 3) return { isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 88 };
              return { isbn: null, allCandidates: [] };
            };
          },
          assert: ({ isbn, ocrCalls }) => {
            expect(isbn).toBe('9780141036144');
            expect(ocrCalls).toBe(3);
          },
        },
        {
          id: 'low-resolution-diagnostics',
          brightness: 128,
          imgWidth: 300,
          imgHeight: 150,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => emptyRunOcr(),
          assert: ({ diagnostics }) => expect(diagnostics?.lowResolution).toBe(true),
        },
        {
          id: 'barcode-success',
          brightness: 128,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () =>
            vi.fn(async (_src: HTMLImageElement | string, label: string): Promise<string | null> =>
              label.endsWith('-full') ? '9780306406157' : null,
            ),
          buildRunOcr: () => emptyRunOcr(),
          assert: ({ isbn, detectionMethod, ocrCalls }) => {
            expect(detectionMethod).toBe('barcode');
            expect(isbn).toBe('9780306406157');
            expect(ocrCalls).toBe(0);
          },
        },
        {
          id: 'conf-high',
          brightness: 128,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => async (..._args: OcrFnArgs): Promise<OcrResult> => ({
            isbn: '9780141036144',
            allCandidates: ['9780141036144'],
            confidence: 87,
          }),
          assert: ({ confidenceBand }) => expect(confidenceBand).toBe('high'),
        },
        {
          id: 'conf-medium',
          brightness: 128,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => async (..._args: OcrFnArgs): Promise<OcrResult> => ({
            isbn: '9780141036144',
            allCandidates: ['9780141036144'],
            confidence: 70,
          }),
          assert: ({ confidenceBand }) => expect(confidenceBand).toBe('medium'),
        },
        {
          id: 'conf-low',
          brightness: 128,
          imgWidth: 640,
          imgHeight: 480,
          buildTryBarcodeDecode: () => vi.fn(async (): Promise<string | null> => null),
          buildRunOcr: () => async (..._args: OcrFnArgs): Promise<OcrResult> => ({
            isbn: '9780141036144',
            allCandidates: ['9780141036144'],
            confidence: 35,
          }),
          assert: ({ confidenceBand }) => expect(confidenceBand).toBe('low'),
        },
      ];

      const headers = ['run_id', 'device', 'fixture', 'method', 'success', 'confidence_band', 'time_ms_mean', 'repeats_n'];
      const rows: Record<string, string | number | boolean>[] = [];
      const bandHist: Record<string, number> = { high: 0, medium: 0, low: 0, none: 0 };
      let successes = 0;

      for (const fx of fixtures) {
        mockBrightness = fx.brightness;
        const timings: number[] = [];
        let lastCombined!: ScanPipelineResult & { ocrCalls: number };

        for (let i = 0; i < REPEATS; i += 1) {
          const innerBarcode = fx.buildTryBarcodeDecode();
          const tryBarcodeDecode = vi.fn(innerBarcode);
          const innerRun = fx.buildRunOcr();
          const runOcrSpy = vi.fn<OcrFnArgs, Promise<OcrResult>>(async (...fnArgs: OcrFnArgs) =>
            innerRun(...fnArgs),
          );

          const { result, unmount } = renderHook(() =>
            useScanPipeline({
              addLog: () => {},
              setStatus: () => {},
              runOcr: runOcrSpy,
              tryBarcodeDecode,
              ocrLanguage: 'en',
            }),
          );

          await act(async () => {
            const img = makeImg(fx.imgWidth, fx.imgHeight);
            const canvas = document.createElement('canvas');
            const t0 = performance.now();
            const res = await result.current.runPipeline(img, canvas, `bench-${fx.id}-`);
            timings.push(performance.now() - t0);
            lastCombined = { ...res, ocrCalls: runOcrSpy.mock.calls.length };
          });
          unmount();

          if (i === 0) fx.assert?.(lastCombined);
        }

        const meanMs = timings.reduce((a, b) => a + b, 0) / timings.length;
        const r = lastCombined!;
        if (r.isbn) successes += 1;

        const cb = r.confidenceBand;
        const bandKey = cb === 'high' || cb === 'medium' || cb === 'low' ? cb : 'none';
        bandHist[bandKey] += 1;

        rows.push({
          run_id: RUN_ID,
          device: DEVICE,
          fixture: fx.id,
          method: methodLabel(r),
          success: Boolean(r.isbn),
          confidence_band: r.confidenceBand ?? '',
          time_ms_mean: Math.round(meanMs * 100) / 100,
          repeats_n: REPEATS,
        });
      }

      const totalFixtures = fixtures.length;
      const body =
        [headers.join(','), ...rows.map((row) => headers.map((h) => csvEscape(String(row[h] ?? ''))).join(','))].join('\n') +
        '\n';
      const summaryLines = [
        `# aggregate,metric,value`,
        `# aggregate,overall_success_rate,${successes}/${totalFixtures}`,
        `# aggregate,avg_time_ms_mean_across_fixture_means,${Math.round((rows.reduce((s, row) => s + Number(row.time_ms_mean), 0) / rows.length) * 100) / 100}`,
        `# aggregate,confidence_band_high,${bandHist.high}`,
        `# aggregate,confidence_band_medium,${bandHist.medium}`,
        `# aggregate,confidence_band_low,${bandHist.low}`,
        `# aggregate,confidence_band_none,${bandHist.none}`,
      ].join('\n');

      process.stdout.write(`${body}\n${summaryLines}\n`);

      if (OUT_PATH) {
        writeFileSync(OUT_PATH, `${body}\n${summaryLines}\n`, 'utf8');
      }

      expect(rows.length).toBe(fixtures.length);
    },
    480_000,
  );
});
