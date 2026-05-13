/**
 * Phase 25 — Scan benchmark runner
 *
 * Runs the scan pipeline against the regression fixture scenarios and emits a
 * CSV (`scan-benchmark.csv` at repo root) capturing fixture, detection method,
 * latency, confidence band, and pass/fail vs expectation.
 *
 * Invoked via `npm run bench:scan`. Excluded from the default `npm test` run
 * because nothing here should gate normal CI — it's a measurement tool.
 *
 * The OCR/barcode dependencies are mocked so the run is deterministic and
 * hardware-independent. Replace the mocked stages with real device traces
 * (e.g. captured frames + real Tesseract) to produce on-device numbers.
 */

import { describe, it, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
    useScanPipeline,
    type ScanPipelineResult,
} from '../src/hooks/useScanPipeline';

interface BenchRow {
    fixture: string;
    scenario: string;
    detectionMethod: string;
    confidenceBand: string;
    latencyMs: number;
    isbn: string;
    suggestionCount: number;
    expected: string;
    pass: boolean;
    notes: string;
}

const results: BenchRow[] = [];

// ── DOM scaffolding (mirrors scanRegressionFixtures.test.ts) ──────────────────

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

function makeImg(width: number, height: number) {
    const img = new Image();
    img.width = width;
    img.height = height;
    return img;
}

function record(scenario: string, fixture: string, expected: string, notes: string, r: ScanPipelineResult, latencyMs: number) {
    const detectionMethod = r.detectionMethod ?? (r.diagnostics?.skipReason ? 'skipped' : 'none');
    const isbn = r.isbn ?? '';
    let pass = false;
    if (expected === 'isbn') pass = !!r.isbn;
    else if (expected === 'no-isbn') pass = !r.isbn;
    else if (expected === 'skip') pass = !!r.diagnostics?.skipReason;
    else if (expected === 'suggestions') pass = (r.suggestions?.length ?? 0) > 0;
    else if (expected === 'low-res') pass = !!r.diagnostics?.lowResolution;

    results.push({
        fixture,
        scenario,
        detectionMethod,
        confidenceBand: r.confidenceBand ?? '',
        latencyMs: Math.round(latencyMs * 100) / 100,
        isbn,
        suggestionCount: r.suggestions?.length ?? 0,
        expected,
        pass,
        notes,
    });
}

async function runScenario(
    scenario: string,
    fixture: string,
    expected: string,
    notes: string,
    setup: () => { img: HTMLImageElement; canvas: HTMLCanvasElement; runOcr: ReturnType<typeof vi.fn>; tryBarcodeDecode: ReturnType<typeof vi.fn> },
) {
    const { img, canvas, runOcr, tryBarcodeDecode } = setup();
    const { result } = renderHook(() =>
        useScanPipeline({ addLog: vi.fn(), setStatus: vi.fn(), runOcr, tryBarcodeDecode }),
    );

    const start = performance.now();
    let pipelineResult: ScanPipelineResult = { isbn: null, suggestions: [] };
    await act(async () => {
        pipelineResult = await result.current.runPipeline(img, canvas, scenario);
    });
    const latencyMs = performance.now() - start;
    record(scenario, fixture, expected, notes, pipelineResult, latencyMs);
}

// ── Scenario suite ───────────────────────────────────────────────────────────

describe('Phase 25 scan benchmark', () => {
    it('dim-light: pipeline skips OCR for blurry + dark frames', async () => {
        await runScenario('dim-light', 'dim-light', 'skip', 'brightness=45, blurry frame; expect OCR skipped via diagnostics.skipReason', () => {
            mockBrightness = 45;
            return {
                img: makeImg(640, 480),
                canvas: document.createElement('canvas'),
                tryBarcodeDecode: vi.fn().mockResolvedValue(null),
                runOcr: vi.fn(),
            };
        });
    });

    it('glossy: bright frame, OCR attempted, no winning ISBN', async () => {
        await runScenario('glossy', 'glossy-cover', 'no-isbn', 'brightness=240, OCR attempted but no valid ISBN', () => {
            mockBrightness = 240;
            return {
                img: makeImg(640, 480),
                canvas: document.createElement('canvas'),
                tryBarcodeDecode: vi.fn().mockResolvedValue(null),
                runOcr: vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] }),
            };
        });
    }, 15000);

    it('partial-barcode-repair: invalid checksum produces suggested ISBN', async () => {
        await runScenario('partial-barcode-repair', 'partial-barcode', 'suggestions', 'OCR yields ISBN with single-digit checksum error; expect repaired suggestion', () => ({
            img: makeImg(640, 480),
            canvas: document.createElement('canvas'),
            tryBarcodeDecode: vi.fn().mockResolvedValue(null),
            runOcr: vi.fn().mockResolvedValue({ isbn: null, allCandidates: ['9780141036145'] }),
        }));
    }, 15000);

    it('rotated-spine: OCR succeeds on a rotation pass', async () => {
        await runScenario('rotated-spine', 'rotated-spine', 'isbn', 'mock OCR succeeds on 3rd pass (90° rotation)', () => {
            let count = 0;
            const runOcr = vi.fn().mockImplementation(async () => {
                count++;
                if (count === 3) return { isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 88 };
                return { isbn: null, allCandidates: [] };
            });
            return {
                img: makeImg(640, 480),
                canvas: document.createElement('canvas'),
                tryBarcodeDecode: vi.fn().mockResolvedValue(null),
                runOcr,
            };
        });
    });

    it('low-resolution: tiny frame flagged in diagnostics', async () => {
        await runScenario('low-resolution', 'low-resolution', 'low-res', '300×150 image; expect diagnostics.lowResolution=true', () => ({
            img: makeImg(300, 150),
            canvas: document.createElement('canvas'),
            tryBarcodeDecode: vi.fn().mockResolvedValue(null),
            runOcr: vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] }),
        }));
    }, 15000);

    it('high-confidence: confidence ≥ 85 → band="high"', async () => {
        await runScenario('confidence-high', 'confidence-band', 'isbn', 'mock OCR confidence=87; expect band=high', () => ({
            img: makeImg(640, 480),
            canvas: document.createElement('canvas'),
            tryBarcodeDecode: vi.fn().mockResolvedValue(null),
            runOcr: vi.fn().mockResolvedValue({ isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 87 }),
        }));
    });

    it('medium-confidence: 60–84 → band="medium"', async () => {
        await runScenario('confidence-medium', 'confidence-band', 'isbn', 'mock OCR confidence=70; expect band=medium', () => ({
            img: makeImg(640, 480),
            canvas: document.createElement('canvas'),
            tryBarcodeDecode: vi.fn().mockResolvedValue(null),
            runOcr: vi.fn().mockResolvedValue({ isbn: '9780141036144', allCandidates: ['9780141036144'], confidence: 70 }),
        }));
    });

    it('barcode-fast-path: barcode hit short-circuits OCR', async () => {
        await runScenario('barcode-fast-path', 'barcode-happy-path', 'isbn', 'barcode decode returns ISBN immediately; OCR should not run', () => ({
            img: makeImg(640, 480),
            canvas: document.createElement('canvas'),
            tryBarcodeDecode: vi.fn().mockResolvedValue('9780141036144'),
            runOcr: vi.fn(),
        }));
    });

    it('clean: normal frame, no ISBN found', async () => {
        await runScenario('clean-no-isbn', 'clean', 'no-isbn', 'baseline frame, no candidates from OCR', () => {
            // Use the bright-frame mock to also verify quality assessment is just
            // exercised here; the key signal is no-isbn under nominal conditions.
            mockBrightness = 128;
            return {
                img: makeImg(640, 480),
                canvas: document.createElement('canvas'),
                tryBarcodeDecode: vi.fn().mockResolvedValue(null),
                runOcr: vi.fn().mockResolvedValue({ isbn: null, allCandidates: [] }),
            };
        });
    }, 15000);

    afterAll(() => {
        const csvPath = resolve(process.cwd(), 'scan-benchmark.csv');
        mkdirSync(dirname(csvPath), { recursive: true });
        const header = ['fixture', 'scenario', 'detectionMethod', 'confidenceBand', 'latencyMs', 'isbn', 'suggestionCount', 'expected', 'pass', 'notes'];
        const rows = results.map((r) => header.map((h) => {
            const v = (r as unknown as Record<string, unknown>)[h];
            const s = v == null ? '' : String(v);
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','));
        writeFileSync(csvPath, [header.join(','), ...rows].join('\n') + '\n');

        const passCount = results.filter(r => r.pass).length;
        const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, results.length);
        console.log('\n=== Phase 25 scan benchmark ===');
        console.log(`Scenarios: ${results.length}  |  Pass: ${passCount}/${results.length}  |  Avg latency: ${avgLatency.toFixed(1)}ms`);
        console.table(results.map(r => ({
            fixture: r.fixture,
            scenario: r.scenario,
            method: r.detectionMethod,
            band: r.confidenceBand,
            latencyMs: r.latencyMs,
            isbn: r.isbn || '—',
            sugg: r.suggestionCount,
            pass: r.pass ? 'PASS' : 'FAIL',
        })));
        console.log(`CSV written: ${csvPath}`);
    });
});
