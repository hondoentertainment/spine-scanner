#!/usr/bin/env node
/**
 * Scan accuracy benchmark runner — Phase 25
 *
 * Runs the regression fixture suite (scanRegressionFixtures.test.ts) via Vitest
 * and appends a timestamped CSV row to benchmark-results.csv so you can track
 * scan accuracy over time as the pipeline evolves.
 *
 * Usage:
 *   node scripts/benchmark-scan.mjs
 *   node scripts/benchmark-scan.mjs --output custom-results.csv
 *
 * Output columns:
 *   timestamp, passed, failed, total, pass_rate, duration_ms, git_sha
 */

import { execSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf('--output');
const OUTPUT_FILE = outputFlagIndex !== -1
  ? resolve(args[outputFlagIndex + 1])
  : resolve(ROOT, 'benchmark-results.csv');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function parseVitestOutput(output) {
  // Vitest summary line: "Tests  12 passed | 2 failed (14)"
  const passMatch = output.match(/(\d+)\s+passed/);
  const failMatch = output.match(/(\d+)\s+failed/);
  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  return { passed, failed };
}

function ensureCsvHeader(file) {
  if (!existsSync(file)) {
    writeFileSync(file, 'timestamp,passed,failed,total,pass_rate,duration_ms,git_sha\n', 'utf8');
  }
}

// ── Run fixtures ──────────────────────────────────────────────────────────────

console.log('Running scan regression fixtures…\n');

const start = Date.now();
const result = spawnSync(
  'npx',
  ['vitest', 'run', 'src/hooks/__tests__/scanRegressionFixtures.test.ts', '--reporter=verbose'],
  { cwd: ROOT, encoding: 'utf8' }
);
const duration = Date.now() - start;

const combinedOutput = (result.stdout ?? '') + (result.stderr ?? '');
const { passed, failed } = parseVitestOutput(combinedOutput);
const total = passed + failed;
const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
const sha = getGitSha();
const timestamp = new Date().toISOString();

// ── Print summary ─────────────────────────────────────────────────────────────

console.log(combinedOutput);
console.log('─'.repeat(60));
console.log(`Passed:    ${passed} / ${total}`);
console.log(`Pass rate: ${passRate}%`);
console.log(`Duration:  ${duration}ms`);
console.log(`Git SHA:   ${sha}`);
console.log(`Output:    ${OUTPUT_FILE}`);
console.log('─'.repeat(60));

// ── Append CSV row ────────────────────────────────────────────────────────────

ensureCsvHeader(OUTPUT_FILE);
appendFileSync(
  OUTPUT_FILE,
  `${timestamp},${passed},${failed},${total},${passRate},${duration},${sha}\n`,
  'utf8'
);

console.log(`\nResults appended to ${OUTPUT_FILE}`);

// Exit with error code if any tests failed, so CI can catch regressions
process.exit(failed > 0 ? 1 : 0);
