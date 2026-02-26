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
import { copyFileSync, mkdirSync, existsSync, createWriteStream } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get as httpsGet } from 'https';

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

// ── Download eng.traineddata.gz for local serving (offline-first) ───
// Tesseract workers normally fetch this from cdn.jsdelivr.net on first use.
// Serving it locally avoids the CDN dependency and makes OCR work offline
// after the first page load (service worker caches the local URL).
const LANG_DATA_FILE = 'eng.traineddata.gz';
const LANG_DATA_DEST = resolve(targetDir, LANG_DATA_FILE);
const LANG_DATA_URL  = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';

if (existsSync(LANG_DATA_DEST)) {
  console.log(`  ✓ ${LANG_DATA_FILE} (already present, skipping download)`);
} else {
  console.log(`  ↓ Downloading ${LANG_DATA_FILE} from jsdelivr (~2 MB)...`);
  await new Promise((resolve, reject) => {
    const file = createWriteStream(LANG_DATA_DEST);
    const request = httpsGet(LANG_DATA_URL, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        file.close();
        httpsGet(res.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => file.close(resolve));
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} downloading ${LANG_DATA_FILE}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    request.on('error', (err) => {
      file.close();
      reject(err);
    });
    request.setTimeout(30000, () => {
      request.destroy();
      file.close();
      reject(new Error('Download timed out after 30s'));
    });
  }).then(() => {
    console.log(`  ✓ ${LANG_DATA_FILE} downloaded`);
  }).catch((err) => {
    // Non-fatal: OCR will fall back to fetching from CDN at runtime
    console.warn(`  ⚠ ${LANG_DATA_FILE} download failed (${err.message}). OCR will fetch from CDN.`);
    if (existsSync(LANG_DATA_DEST)) {
      try { require('fs').unlinkSync(LANG_DATA_DEST); } catch { /* ignore */ }
    }
  });
}
