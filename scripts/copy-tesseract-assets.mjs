/**
 * Copies tesseract.js WASM core files from node_modules to public/tesseract/
 * so the OCR web worker can load them from the same origin instead of CDN.
 *
 * This eliminates the most fragile CDN dependency: the WASM core is loaded
 * via importScripts() inside a Blob URL worker, which cannot be intercepted
 * by any Service Worker. Serving locally makes it reliable on all networks.
 *
 * Runs as postinstall and prebuild hook.
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const targetDir = resolve(root, 'public', 'tesseract');

// LSTM-only variants (matches OEM.LSTM_ONLY default).
// getCore.js picks the right one based on browser SIMD support.
const CORE_FILES = [
  'tesseract-core-simd-lstm.wasm.js',       // Chrome 91+, Firefox 89+
  'tesseract-core-lstm.wasm.js',             // No-SIMD fallback
  'tesseract-core-relaxedsimd-lstm.wasm.js', // Chrome 114+, Safari 15.2+
];

// Worker script — runs inside a Web Worker (Blob URL), so it must be
// fetchable from the same origin via importScripts().
const WORKER_FILE = 'worker.min.js';

mkdirSync(targetDir, { recursive: true });

const expectedCount = CORE_FILES.length + 1;
let copied = 0;
const missing = [];

// Copy WASM core files
for (const file of CORE_FILES) {
  const src = resolve(root, 'node_modules', 'tesseract.js-core', file);
  const dest = resolve(targetDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`  ✓ ${file}`);
    copied++;
  } else {
    console.error(`  ✗ ${file} not found in node_modules`);
    missing.push(`tesseract.js-core/${file}`);
  }
}

// Copy worker script
const workerSrc = resolve(root, 'node_modules', 'tesseract.js', 'dist', WORKER_FILE);
const workerDest = resolve(targetDir, WORKER_FILE);
if (existsSync(workerSrc)) {
  copyFileSync(workerSrc, workerDest);
  console.log(`  ✓ ${WORKER_FILE}`);
  copied++;
} else {
  console.error(`  ✗ ${WORKER_FILE} not found in node_modules/tesseract.js/dist/`);
  missing.push(`tesseract.js/dist/${WORKER_FILE}`);
}

console.log(`Copied ${copied}/${expectedCount} tesseract assets to public/tesseract/`);

if (missing.length > 0) {
  console.error(`\nERROR: Missing ${missing.length} Tesseract assets. OCR will not work.`);
  console.error('Missing:', missing.join(', '));
  process.exit(1);
}
