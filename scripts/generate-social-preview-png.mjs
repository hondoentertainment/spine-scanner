import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = join(root, 'public', 'social-preview.svg');
const outputPath = join(root, 'public', 'social-preview.png');

if (!existsSync(inputPath)) {
  console.error(`Missing input file: public/social-preview.svg`);
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
}

try {
  await sharp(inputPath).resize({ width: 1200 }).png().toFile(outputPath);
} catch (err) {
  console.error(err?.message ?? err);
  process.exit(1);
}

console.log('Wrote public/social-preview.png');
