import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const assetsDir = path.join(repoRoot, 'dist', 'assets');

const MAX_BYTES = 4_500_000;
const MAX_SCANNER_BYTES = 3_200_000;
const MAX_REACT_BYTES = 600_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(assetsDir)) {
  fail(
    `check-bundle-budget: missing directory "${path.relative(repoRoot, assetsDir)}". Run a production build first (npm run build) so dist/assets exists.`,
  );
}

function listJsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const jsFiles = listJsFiles(assetsDir).sort((a, b) => a.localeCompare(b));

for (const filePath of jsFiles) {
  const stat = fs.statSync(filePath);
  const bytes = stat.size;
  const name = path.basename(filePath);
  const kb = (bytes / 1024).toFixed(2);
  console.log(`${name}: ${kb} KB`);

  if (bytes > MAX_BYTES) {
    fail(
      `check-bundle-budget: "${name}" is ${bytes} bytes (limit ${MAX_BYTES} bytes / 4.5 MB).`,
    );
  }

  const lower = name.toLowerCase();
  if (lower.includes('scanner') && bytes > MAX_SCANNER_BYTES) {
    fail(
      `check-bundle-budget: scanner chunk "${name}" is ${bytes} bytes (limit ${MAX_SCANNER_BYTES} bytes / 3.2 MB).`,
    );
  }
  if (lower.includes('react') && bytes > MAX_REACT_BYTES) {
    fail(
      `check-bundle-budget: react chunk "${name}" is ${bytes} bytes (limit ${MAX_REACT_BYTES} bytes / 600 KB).`,
    );
  }
}

process.exit(0);
