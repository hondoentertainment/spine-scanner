/**
 * Phase 25 — Scan device benchmark runner.
 *
 * Runs the scan pipeline's deterministic planning layer against the
 * difficult-capture fixture set and writes a CSV snapshot. The number of OCR
 * passes is the dominant cost driver for a scan, so it serves as a measurable
 * time-to-add proxy that can be diffed across pipeline changes.
 *
 * This benchmarks the exported, side-effect-free planning functions
 * (`buildOcrPasses`, `getQualityHints`, `hasLowOcrResolution`) so results are
 * fully deterministic. Real-device scan success rates come from manual
 * capture sessions; this harness guards the planning cost that feeds them.
 *
 * Run: npm run benchmark:scan
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOcrPasses,
  getQualityHints,
  hasLowOcrResolution,
  isLowResolution,
  CROP_NARROW,
  DARK_SCENE_THRESHOLD,
  BLUR_VARIANCE_THRESHOLD,
} from '../src/hooks/useScanPipeline.ts';
import type { FrameQuality } from '../src/hooks/useScanPipeline.ts';

interface ScanFixture {
  name: string;
  brightness: number;
  blurVariance: number;
  contrast: number;
  isLowContrast: boolean;
  width: number;
  height: number;
}

/** Difficult-capture scenarios, mirroring scanRegressionFixtures.test.ts. */
const FIXTURES: ScanFixture[] = [
  { name: 'ideal', brightness: 150, blurVariance: 320, contrast: 62, isLowContrast: false, width: 1920, height: 1080 },
  { name: 'dim-light', brightness: 45, blurVariance: 160, contrast: 38, isLowContrast: false, width: 1280, height: 720 },
  { name: 'very-dark', brightness: 28, blurVariance: 150, contrast: 30, isLowContrast: false, width: 1280, height: 720 },
  { name: 'borderline-dark', brightness: 104, blurVariance: 150, contrast: 44, isLowContrast: false, width: 1280, height: 720 },
  { name: 'glossy-glare', brightness: 240, blurVariance: 210, contrast: 55, isLowContrast: false, width: 1920, height: 1080 },
  { name: 'blurry', brightness: 132, blurVariance: 60, contrast: 46, isLowContrast: false, width: 1280, height: 720 },
  { name: 'low-contrast', brightness: 128, blurVariance: 150, contrast: 18, isLowContrast: true, width: 1280, height: 720 },
  { name: 'low-resolution', brightness: 130, blurVariance: 150, contrast: 45, isLowContrast: false, width: 480, height: 360 },
  { name: 'blurry-and-dark', brightness: 40, blurVariance: 55, contrast: 30, isLowContrast: false, width: 1280, height: 720 },
];

function toQuality(f: ScanFixture): FrameQuality {
  return {
    brightness: f.brightness,
    blurVariance: f.blurVariance,
    isDark: f.brightness < DARK_SCENE_THRESHOLD,
    isBlurry: f.blurVariance < BLUR_VARIANCE_THRESHOLD,
    contrast: f.contrast,
    isLowContrast: f.isLowContrast,
  };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe('scan pipeline benchmark', () => {
  it('measures scan-plan cost across the difficult-capture fixture set', () => {
    // Micro-benchmark: scan-planning throughput (µs per buildOcrPasses call).
    const iterations = 4000;
    const startedAt = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const f of FIXTURES) buildOcrPasses(toQuality(f), 'bench-');
    }
    const elapsedMs = performance.now() - startedAt;
    const usPerPlan = (elapsedMs * 1000) / (iterations * FIXTURES.length);

    const header = [
      'fixture', 'brightness', 'blurVariance', 'contrast', 'imgWidth', 'imgHeight',
      'isDark', 'isBlurry', 'isLowContrast', 'lowResolution', 'ocrPassesPlanned',
      'firstPass', 'qualityHints',
    ];
    const rows: string[][] = [];
    const passCounts: number[] = [];

    for (const f of FIXTURES) {
      const quality = toQuality(f);
      const lowRes = isLowResolution(f.width) || hasLowOcrResolution(f.width, f.height, CROP_NARROW);
      const passes = buildOcrPasses(quality, `${f.name}-`);
      const hints = getQualityHints(quality, lowRes);
      passCounts.push(passes.length);
      rows.push([
        f.name,
        String(f.brightness),
        String(f.blurVariance),
        String(f.contrast),
        String(f.width),
        String(f.height),
        String(quality.isDark),
        String(quality.isBlurry),
        String(quality.isLowContrast),
        String(lowRes),
        String(passes.length),
        passes[0]?.label ?? '',
        hints.join('|'),
      ]);
    }

    const csv = [header, ...rows].map(r => r.join(',')).join('\n') + '\n';
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const outDir = join(root, 'benchmark-results');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, 'scan-benchmark.csv');
    writeFileSync(outPath, csv, 'utf-8');

    console.log('\nScan pipeline benchmark');
    console.log('-----------------------');
    console.log(`Fixtures:            ${FIXTURES.length}`);
    console.log(`OCR passes planned:  min ${Math.min(...passCounts)}  median ${median(passCounts)}  max ${Math.max(...passCounts)}`);
    console.log(`Planning throughput: ${usPerPlan.toFixed(2)} µs/scan-plan`);
    console.log(`CSV written:         ${outPath}\n`);
    for (const r of rows) {
      console.log(`  ${r[0].padEnd(18)} passes=${r[10].padStart(2)}  first=${r[11]}`);
    }
    console.log('');

    expect(rows).toHaveLength(FIXTURES.length);
    expect(passCounts.every(count => count > 0)).toBe(true);
  });
});
