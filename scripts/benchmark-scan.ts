#!/usr/bin/env tsx
/**
 * Phase 25 — Scan pipeline benchmark runner.
 *
 * Runs each regression fixture scenario through the scan pipeline decision
 * logic (quality assessment, pass selection, OCR simulation) and reports
 * timing + outcomes as CSV.
 *
 * Usage:  npm run benchmark:scan
 * Output: CSV table to stdout + scripts/benchmark-results.csv
 */

import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Minimal browser API mocks (set before any module is imported) ────────────

let _mockBrightness = 128;

function makeMockCtx() {
  return {
    save() {}, restore() {}, translate() {}, rotate() {},
    drawImage() {}, putImageData() {},
    filter: '',
    canvas: null as unknown as HTMLCanvasElement,
    getImageData(_x: number, _y: number, w: number, h: number) {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i + 1] = d[i + 2] = _mockBrightness;
        d[i + 3] = 255;
      }
      return { data: d, width: w, height: h } as ImageData;
    },
  } as unknown as CanvasRenderingContext2D;
}

class MockCanvas {
  width = 640;
  height = 480;
  getContext(_type: string) { return makeMockCtx(); }
  toDataURL() { return 'data:image/png;base64,mock'; }
}

class MockImage {
  constructor(public width = 640, public height = 480) {}
}

Object.assign(globalThis, {
  HTMLCanvasElement: MockCanvas,
  HTMLImageElement: MockImage,
  document: { createElement: (t: string) => t === 'canvas' ? new MockCanvas() : {} },
});

// ── Import scan pipeline pure functions ──────────────────────────────────────

const {
  assessFrameQuality,
  buildOcrPasses,
  hasLowOcrResolution,
  getQualityHints,
  CROP_NARROW,
} = await import('../src/hooks/useScanPipeline.ts') as typeof import('../src/hooks/useScanPipeline.ts');

// ── Fixture definitions ───────────────────────────────────────────────────────

type ConfidenceBand = 'high' | 'medium' | 'low' | 'none';

interface Fixture {
  name: string;
  imageW: number;
  imageH: number;
  brightness: number;
  barcodeResult: string | null;
  // null = OCR finds nothing; defined = OCR succeeds on this pass index
  ocrSimResult: { isbn: string; confidence: number; passIndex: number } | null;
}

const FIXTURES: Fixture[] = [
  {
    name: 'dim-light',
    imageW: 640, imageH: 480,
    brightness: 45,
    barcodeResult: null,
    ocrSimResult: null,
  },
  {
    name: 'glossy-cover',
    imageW: 640, imageH: 480,
    brightness: 240,
    barcodeResult: null,
    ocrSimResult: { isbn: '9780141036144', confidence: 72, passIndex: 2 },
  },
  {
    name: 'partial-barcode',
    imageW: 640, imageH: 480,
    brightness: 128,
    barcodeResult: null,
    ocrSimResult: { isbn: '9780141036144', confidence: 88, passIndex: 1 },
  },
  {
    name: 'rotated-spine-90deg',
    imageW: 640, imageH: 480,
    brightness: 128,
    barcodeResult: null,
    ocrSimResult: { isbn: '9780141036144', confidence: 88, passIndex: 3 },
  },
  {
    name: 'low-resolution',
    imageW: 300, imageH: 150,
    brightness: 128,
    barcodeResult: null,
    ocrSimResult: null,
  },
  {
    name: 'barcode-success',
    imageW: 1280, imageH: 720,
    brightness: 150,
    barcodeResult: '9780141036144',
    ocrSimResult: null,
  },
];

// ── Pipeline simulation ───────────────────────────────────────────────────────

const SKIP_OCR_BRIGHTNESS_THRESHOLD = 70;

interface BenchmarkRow {
  fixture: string;
  method: 'barcode' | 'ocr' | 'none';
  success: boolean;
  confidence_band: ConfidenceBand;
  time_ms: number;
  passes_built: number;
  low_resolution: boolean;
  quality_hints: string;
}

function confidenceBand(confidence?: number): ConfidenceBand {
  if (confidence == null) return 'none';
  if (confidence >= 85) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}

function runFixture(fixture: Fixture): BenchmarkRow {
  _mockBrightness = fixture.brightness;
  const img = new MockImage(fixture.imageW, fixture.imageH) as unknown as HTMLImageElement;
  const canvas = new MockCanvas() as unknown as HTMLCanvasElement;

  const start = performance.now();

  // Phase 1: Barcode
  if (fixture.barcodeResult) {
    const time_ms = +(performance.now() - start).toFixed(3);
    return {
      fixture: fixture.name, method: 'barcode', success: true,
      confidence_band: 'high', time_ms, passes_built: 0,
      low_resolution: false, quality_hints: 'ok',
    };
  }

  // Phase 2: Frame quality assessment
  const quality = assessFrameQuality(img, canvas, CROP_NARROW);
  const lowRes = hasLowOcrResolution(img.width, img.height, CROP_NARROW);
  const hints = getQualityHints(quality, lowRes);

  // Skip OCR when both blurry and very dark
  if (quality.isBlurry && quality.brightness < SKIP_OCR_BRIGHTNESS_THRESHOLD) {
    const time_ms = +(performance.now() - start).toFixed(3);
    return {
      fixture: fixture.name, method: 'none', success: false,
      confidence_band: 'none', time_ms, passes_built: 0,
      low_resolution: lowRes, quality_hints: hints.join('+'),
    };
  }

  // Phase 2: Build OCR pass list
  const passes = buildOcrPasses(quality, '');

  // Simulate OCR: succeed on the configured pass index if defined
  let isbn: string | null = null;
  let conf: number | undefined;
  if (fixture.ocrSimResult) {
    const { passIndex, isbn: simIsbn, confidence } = fixture.ocrSimResult;
    if (passIndex < passes.length) {
      isbn = simIsbn;
      conf = confidence;
    }
  }

  const time_ms = +(performance.now() - start).toFixed(3);
  return {
    fixture: fixture.name,
    method: isbn ? 'ocr' : 'none',
    success: isbn != null,
    confidence_band: confidenceBand(conf),
    time_ms,
    passes_built: passes.length,
    low_resolution: lowRes,
    quality_hints: hints.join('+'),
  };
}

// ── Run all fixtures ──────────────────────────────────────────────────────────

console.log('\nSpineScanner — Scan Pipeline Benchmark\n');

// Three repetitions per fixture to smooth timing noise; take the median
const REPS = 3;
const rows: BenchmarkRow[] = FIXTURES.map((fixture) => {
  const runs = Array.from({ length: REPS }, () => runFixture(fixture));
  runs.sort((a, b) => a.time_ms - b.time_ms);
  return runs[Math.floor(REPS / 2)];
});

// ── Console table ─────────────────────────────────────────────────────────────

const COL_W = [22, 9, 9, 16, 10, 14, 15, 22];
const HEADERS = ['fixture', 'method', 'success', 'confidence_band', 'time_ms', 'passes_built', 'low_resolution', 'quality_hints'];

function pad(s: string, w: number) { return s.padEnd(w); }

console.log(HEADERS.map((h, i) => pad(h, COL_W[i])).join('  '));
console.log(HEADERS.map((_, i) => '-'.repeat(COL_W[i])).join('  '));
for (const r of rows) {
  const vals = [
    r.fixture, r.method, String(r.success), r.confidence_band,
    r.time_ms.toFixed(3), String(r.passes_built), String(r.low_resolution), r.quality_hints,
  ];
  console.log(vals.map((v, i) => pad(v, COL_W[i])).join('  '));
}

// ── Aggregate metrics ─────────────────────────────────────────────────────────

const successCount = rows.filter(r => r.success).length;
const successRate = ((successCount / rows.length) * 100).toFixed(1);
const avgTime = (rows.reduce((s, r) => s + r.time_ms, 0) / rows.length).toFixed(3);
const bandCounts = { high: 0, medium: 0, low: 0, none: 0 };
for (const r of rows) bandCounts[r.confidence_band]++;

console.log(`\nAggregate metrics (${rows.length} fixtures, ${REPS} reps each)`);
console.log(`  Overall success rate : ${successRate}% (${successCount}/${rows.length})`);
console.log(`  Average time-to-add  : ${avgTime} ms`);
console.log(`  Confidence bands     : high=${bandCounts.high} medium=${bandCounts.medium} low=${bandCounts.low} none=${bandCounts.none}`);

// ── Write CSV ─────────────────────────────────────────────────────────────────

const csvLines = [
  HEADERS.join(','),
  ...rows.map(r =>
    [r.fixture, r.method, r.success, r.confidence_band, r.time_ms.toFixed(3),
      r.passes_built, r.low_resolution, r.quality_hints].join(',')
  ),
];
const outPath = resolve(__dirname, 'benchmark-results.csv');
writeFileSync(outPath, csvLines.join('\n') + '\n', 'utf8');
console.log(`\nCSV written to scripts/benchmark-results.csv\n`);
