/**
 * Phase 25 — Scan pipeline benchmark against the same synthetic scenarios as
 * `scanRegressionFixtures.test.ts`. Outputs CSV (stdout or file path arg).
 *
 *   npm run benchmark:scan
 *   npm run benchmark:scan -- ./scan-benchmark.csv
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import {
  buildOcrPasses,
  getQualityHints,
  hasLowOcrResolution,
  CROP_MEDIUM,
  CROP_NARROW,
  type FrameQuality,
} from '../src/hooks/useScanPipeline.ts';

const RUN_ID = new Date().toISOString();
const DEVICE = process.env.SCAN_BENCHMARK_DEVICE ?? hostname();
const ITER = 2000;

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

type Row = Record<string, string | number | boolean>;

function rowToCsv(r: Row, headers: string[]): string {
  return headers.map((h) => csvEscape(String(r[h] ?? ''))).join(',');
}

const ocrScenarios: { id: string; quality: FrameQuality; prefix: string }[] = [
  { id: 'dim-light', quality: { brightness: 45, blurVariance: 150, isDark: true, isBlurry: false }, prefix: 'dim-' },
  { id: 'glossy-overexposed', quality: { brightness: 240, blurVariance: 150, isDark: false, isBlurry: false }, prefix: 'glare-' },
  { id: 'rotated-spine-normal', quality: { brightness: 128, blurVariance: 150, isDark: false, isBlurry: false }, prefix: 'rot-' },
  { id: 'both-blurry-and-dark', quality: { brightness: 40, blurVariance: 40, isDark: true, isBlurry: true }, prefix: 'skip-' },
];

const resolutionChecks: { id: string; w: number; h: number; crop: typeof CROP_MEDIUM | typeof CROP_NARROW }[] = [
  { id: 'low-res-400x300-medium', w: 400, h: 300, crop: CROP_MEDIUM },
  { id: 'low-res-300x200-narrow', w: 300, h: 200, crop: CROP_NARROW },
  { id: 'full-hd-1920x1080', w: 1920, h: 1080, crop: CROP_MEDIUM },
];

function benchBuildOcrPasses(quality: FrameQuality, prefix: string): number {
  const t0 = performance.now();
  for (let i = 0; i < ITER; i++) buildOcrPasses(quality, prefix);
  return performance.now() - t0;
}

function main(): void {
  const outPath = process.argv[2];
  const headers = [
    'run_id',
    'device',
    'scenario_id',
    'kind',
    'brightness',
    'blur_variance',
    'is_dark',
    'is_blurry',
    'pass_count',
    'first_pass',
    'last_pass',
    'hints_joined',
    'low_res_flag',
    'bench_ms_2000_iter',
  ];

  const lines: string[] = [headers.join(',')];

  for (const sc of ocrScenarios) {
    const passes = buildOcrPasses(sc.quality, sc.prefix);
    const lowRes = hasLowOcrResolution(640, 480, CROP_MEDIUM);
    const hints = getQualityHints(sc.quality, lowRes).join('|');
    const ms = benchBuildOcrPasses(sc.quality, sc.prefix);
    const row: Row = {
      run_id: RUN_ID,
      device: DEVICE,
      scenario_id: sc.id,
      kind: 'ocr_pass_plan',
      brightness: sc.quality.brightness,
      blur_variance: sc.quality.blurVariance,
      is_dark: sc.quality.isDark,
      is_blurry: sc.quality.isBlurry,
      pass_count: passes.length,
      first_pass: passes[0]?.label ?? '',
      last_pass: passes[passes.length - 1]?.label ?? '',
      hints_joined: hints,
      low_res_flag: lowRes,
      bench_ms_2000_iter: Math.round(ms * 100) / 100,
    };
    lines.push(rowToCsv(row, headers));
  }

  for (const rc of resolutionChecks) {
    const lowRes = hasLowOcrResolution(rc.w, rc.h, rc.crop);
    const t0 = performance.now();
    for (let i = 0; i < ITER; i++) hasLowOcrResolution(rc.w, rc.h, rc.crop);
    const ms = performance.now() - t0;
    const row: Row = {
      run_id: RUN_ID,
      device: DEVICE,
      scenario_id: rc.id,
      kind: 'resolution_gate',
      brightness: '',
      blur_variance: '',
      is_dark: '',
      is_blurry: '',
      pass_count: '',
      first_pass: '',
      last_pass: '',
      hints_joined: '',
      low_res_flag: lowRes,
      bench_ms_2000_iter: Math.round(ms * 100) / 100,
    };
    lines.push(rowToCsv(row, headers));
  }

  const body = lines.join('\n') + '\n';
  if (outPath) {
    writeFileSync(outPath, body, 'utf8');
    process.stderr.write(`Wrote ${lines.length - 1} data rows to ${outPath}\n`);
  }
  process.stdout.write(body);
}

main();
