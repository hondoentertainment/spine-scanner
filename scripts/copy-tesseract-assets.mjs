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

// Candidate locations for Tesseract assets across package versions.
// We always copy to canonical names expected by the app runtime.
const CORE_ASSET_CANDIDATES = {
  'tesseract-core-simd-lstm.wasm.js': [
    'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js',
  ],
  'tesseract-core-lstm.wasm.js': [
    'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    'node_modules/tesseract.js-core/tesseract-core.wasm.js',
  ],
  'tesseract-core-relaxedsimd-lstm.wasm.js': [
    'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
    'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js',
  ],
};
const WORKER_FILE_CANDIDATES = [
  'node_modules/tesseract.js/dist/worker.min.js',
  'node_modules/tesseract.js/src/worker-script/index.js',
];

mkdirSync(targetDir, { recursive: true });

const expectedCount = Object.keys(CORE_ASSET_CANDIDATES).length + 1;
let copied = 0;
const missing = [];

const resolveFirstExisting = (candidates) => {
  for (const relativePath of candidates) {
    const absolutePath = resolve(root, relativePath);
    if (existsSync(absolutePath)) return { absolutePath, relativePath };
  }
  return null;
};

// Copy WASM core files
for (const [targetFile, candidates] of Object.entries(CORE_ASSET_CANDIDATES)) {
  const source = resolveFirstExisting(candidates);
  const dest = resolve(targetDir, targetFile);
  if (source) {
    copyFileSync(source.absolutePath, dest);
    console.log(`  ✓ ${targetFile} (from ${source.relativePath})`);
    copied++;
  } else {
    console.error(`  ✗ ${targetFile} not found in known tesseract.js-core paths`);
    missing.push(...candidates);
  }
}

// Copy worker script
const WORKER_FILE = 'worker.min.js';
const workerSource = resolveFirstExisting(WORKER_FILE_CANDIDATES);
const workerDest = resolve(targetDir, WORKER_FILE);
if (workerSource) {
  copyFileSync(workerSource.absolutePath, workerDest);
  console.log(`  ✓ ${WORKER_FILE} (from ${workerSource.relativePath})`);
  copied++;
} else {
  console.error(`  ✗ ${WORKER_FILE} not found in known tesseract.js paths`);
  missing.push(...WORKER_FILE_CANDIDATES);
}

console.log(`Copied ${copied}/${expectedCount} tesseract assets to public/tesseract/`);

if (missing.length > 0) {
  console.error(`\nERROR: Missing ${missing.length} Tesseract assets. OCR will not work.`);
  console.error('Missing:', missing.join(', '));
  process.exit(1);
}
