/**
 * Generates 192x192 and 512x512 PNG icons for PWA manifest.
 * Uses pngjs (pure JS) — no native deps. Theme color #0f172a to match app.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'public');
// SpineScanner theme
const R = 15, G = 23, B = 42, A = 255;

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = R;
    png.data[i + 1] = G;
    png.data[i + 2] = B;
    png.data[i + 3] = A;
  }
  return PNG.sync.write(png);
}

mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), createIcon(size));
  console.log(`  ✓ icon-${size}.png`);
}
console.log('PWA icons generated.');
