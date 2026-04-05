#!/usr/bin/env node
/**
 * Phase 25 — Scan regression benchmark
 *
 * Runs Vitest on scanRegressionFixtures.test.ts and prints CSV rows:
 *   suite,test_name,status,duration_ms
 *
 * Usage:
 *   node scripts/benchmark-scan.mjs
 *   node scripts/benchmark-scan.mjs --out scan-benchmark.csv
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseArgs(argv) {
  const outIdx = argv.indexOf('--out');
  if (outIdx !== -1 && argv[outIdx + 1]) {
    return { outPath: argv[outIdx + 1] };
  }
  return { outPath: null };
}

function csvEscape(value) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const { outPath } = parseArgs(process.argv.slice(2));

const vitestBin = join(root, 'node_modules', '.bin', 'vitest');
const result = spawnSync(vitestBin, ['run', 'src/hooks/__tests__/scanRegressionFixtures.test.ts', '--reporter=json', '--silent'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  env: { ...process.env, CI: '1' },
});

const stdout = result.stdout || '';
const stderr = result.stderr || '';
const report = extractJsonObject(stdout) ?? extractJsonObject(`${stdout}\n${stderr}`);

const lines = ['suite,test_name,status,duration_ms'];

if (!report?.testResults?.length) {
  lines.push(csvEscape('(parse error)'), csvEscape('vitest json output missing or invalid'), 'error', '0');
  const body = lines.join('\n') + '\n';
  if (outPath) writeFileSync(outPath, body, 'utf8');
  else process.stdout.write(body);
  process.exit(1);
}

for (const file of report.testResults) {
  const suite = file.name?.replace(root + '/', '') || 'unknown';
  for (const ar of file.assertionResults || []) {
    const title = ar.fullName || ar.title || '';
    const status = ar.status || 'unknown';
    const ms = typeof ar.duration === 'number' ? Math.round(ar.duration) : '';
    lines.push([csvEscape(suite), csvEscape(title), csvEscape(status), csvEscape(ms)].join(','));
  }
}

const body = lines.join('\n') + '\n';
if (outPath) writeFileSync(outPath, body, 'utf8');
else process.stdout.write(body);

process.exit(report.success === true ? 0 : 1);
