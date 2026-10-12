import type { RgbaImage, SpineRegion } from './types.ts';

/**
 * On-device shelf segmentation.
 *
 * Downscales the photo, splits horizontal bands where a row of books is
 * separated by empty shelf, then splits each band into spines wherever the
 * column color changes. Flat regions that match the photo's left and right
 * border are treated as background, not books.
 *
 * This is a free/offline fallback. Similar-colored spines and white books
 * without visible text are a known limit; an optional vision endpoint can
 * fill those in when configured.
 */

const ANALYSIS_MAX_WIDTH = 480;
const ROW_EDGE_DISTANCE = 24;
const MIN_ROW_EDGES = 2;
const COLOR_SPLIT_DISTANCE = 28;
const SAME_COLOR_DISTANCE = 18;
const BACKGROUND_DISTANCE = 22;
const TEXT_STDDEV = 14;

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface ColorRun {
  start: number;
  end: number;
  color: RGB;
}

interface Band {
  y: number;
  height: number;
}

interface UnscaledSpine {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

const colorDistance = (a: RGB, b: RGB): number => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const pixelColor = (image: RgbaImage, x: number, y: number): RGB => {
  const i = (y * image.width + x) * 4;
  return { r: image.data[i] ?? 0, g: image.data[i + 1] ?? 0, b: image.data[i + 2] ?? 0 };
};

const luminance = (color: RGB): number => color.r * 0.299 + color.g * 0.587 + color.b * 0.114;

const mixColors = (a: RGB, aWeight: number, b: RGB, bWeight: number): RGB => {
  const total = aWeight + bWeight || 1;
  return {
    r: (a.r * aWeight + b.r * bWeight) / total,
    g: (a.g * aWeight + b.g * bWeight) / total,
    b: (a.b * aWeight + b.b * bWeight) / total,
  };
};

const downscale = (image: RgbaImage, maxWidth: number): RgbaImage => {
  if (image.width <= maxWidth || image.width < 2 || image.height < 2) return image;
  const width = maxWidth;
  const height = Math.max(1, Math.round(image.height * (maxWidth / image.width)));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const si = (sy * image.width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = image.data[si] ?? 0;
      data[di + 1] = image.data[si + 1] ?? 0;
      data[di + 2] = image.data[si + 2] ?? 0;
      data[di + 3] = 255;
    }
  }
  return { width, height, data };
};

const rowEdgeCount = (image: RgbaImage, y: number): number => {
  let count = 0;
  for (let x = 0; x < image.width - 1; x++) {
    if (colorDistance(pixelColor(image, x, y), pixelColor(image, x + 1, y)) > ROW_EDGE_DISTANCE) {
      count++;
    }
  }
  return count;
};

const closeShortHoles = (active: boolean[], maxHole: number): boolean[] => {
  const next = active.slice();
  let i = 0;
  while (i < next.length) {
    if (next[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < next.length && !next[j]) j++;
    if (i > 0 && j < next.length && j - i <= maxHole) {
      for (let k = i; k < j; k++) next[k] = true;
    }
    i = j;
  }
  return next;
};

const findShelfBands = (image: RgbaImage): Band[] => {
  const active = closeShortHoles(
    Array.from({ length: image.height }, (_, y) => rowEdgeCount(image, y) >= MIN_ROW_EDGES),
    2,
  );
  const minBand = Math.max(12, Math.round(image.height * 0.1));
  const bands: Band[] = [];
  let y = 0;
  while (y < active.length) {
    if (!active[y]) {
      y++;
      continue;
    }
    let end = y;
    while (end < active.length && active[end]) end++;
    if (end - y >= minBand) bands.push({ y, height: end - y });
    y = end;
  }
  return bands;
};

const columnColors = (image: RgbaImage, band: Band): RGB[] => {
  const colors: RGB[] = [];
  const step = Math.max(1, Math.floor(band.height / 24));
  for (let x = 0; x < image.width; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = band.y; y < band.y + band.height; y += step) {
      const color = pixelColor(image, x, y);
      r += color.r;
      g += color.g;
      b += color.b;
      n++;
    }
    colors.push({ r: r / n, g: g / n, b: b / n });
  }
  return colors;
};

const splitColorRuns = (colors: RGB[]): ColorRun[] => {
  if (colors.length === 0) return [];
  const runs: ColorRun[] = [];
  let start = 0;
  let mean = colors[0];
  let count = 1;
  for (let x = 1; x < colors.length; x++) {
    if (colorDistance(colors[x], mean) > COLOR_SPLIT_DISTANCE) {
      runs.push({ start, end: x, color: mean });
      start = x;
      mean = colors[x];
      count = 1;
      continue;
    }
    count += 1;
    mean = mixColors(mean, count - 1, colors[x], 1);
  }
  runs.push({ start, end: colors.length, color: mean });
  return mergeSimilarRuns(runs);
};

const mergeSimilarRuns = (runs: ColorRun[]): ColorRun[] => {
  if (runs.length === 0) return [];
  const merged: ColorRun[] = [{ ...runs[0] }];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    const run = runs[i];
    if (colorDistance(prev.color, run.color) < SAME_COLOR_DISTANCE) {
      const prevWidth = prev.end - prev.start;
      const runWidth = run.end - run.start;
      prev.color = mixColors(prev.color, prevWidth, run.color, runWidth);
      prev.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
};

const averageRange = (colors: RGB[], start: number, end: number): RGB | null => {
  if (end <= start) return null;
  let mixed = colors[start];
  for (let i = start + 1; i < end; i++) {
    mixed = mixColors(mixed, i - start, colors[i], 1);
  }
  return mixed;
};

const borderBackground = (colors: RGB[]): RGB | null => {
  const edge = Math.max(1, Math.round(colors.length * 0.02));
  const left = averageRange(colors, 0, edge);
  const right = averageRange(colors, colors.length - edge, colors.length);
  if (!left || !right) return null;
  if (colorDistance(left, right) > BACKGROUND_DISTANCE) return null;
  return mixColors(left, 1, right, 1);
};

const segmentStddev = (image: RgbaImage, x0: number, x1: number, y: number): number => {
  const values: number[] = [];
  const safeY = Math.max(0, Math.min(image.height - 1, y));
  for (let x = x0; x < x1; x++) {
    values.push(luminance(pixelColor(image, x, safeY)));
  }
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const findSpinesInBand = (image: RgbaImage, band: Band): UnscaledSpine[] => {
  const colors = columnColors(image, band);
  const runs = splitColorRuns(colors);
  const minSpine = Math.max(8, Math.round(image.width * 0.028));
  const maxSpine = Math.round(image.width * 0.62);
  const background = borderBackground(colors);
  const midY = band.y + Math.floor(band.height / 2);
  const spines: UnscaledSpine[] = [];

  for (const run of runs) {
    const width = run.end - run.start;
    if (width < minSpine || width > maxSpine) continue;
    const textured = segmentStddev(image, run.start, run.end, midY) >= TEXT_STDDEV;
    if (background && colorDistance(run.color, background) < BACKGROUND_DISTANCE && !textured) continue;
    const contrast = background ? colorDistance(run.color, background) : 48;
    spines.push({
      x: run.start,
      y: band.y,
      width,
      height: band.height,
      confidence: Math.max(0.5, Math.min(0.92, 0.5 + contrast / 320)),
    });
  }
  return spines;
};

const scaleRegion = (
  spine: UnscaledSpine,
  original: RgbaImage,
  analyzed: RgbaImage,
  id: string,
): SpineRegion => {
  const scaleX = original.width / analyzed.width;
  const scaleY = original.height / analyzed.height;
  const x = Math.max(0, Math.min(original.width - 1, Math.round(spine.x * scaleX)));
  const y = Math.max(0, Math.min(original.height - 1, Math.round(spine.y * scaleY)));
  const width = Math.max(1, Math.min(original.width - x, Math.round(spine.width * scaleX)));
  const height = Math.max(1, Math.min(original.height - y, Math.round(spine.height * scaleY)));
  return { id, x, y, width, height, confidence: spine.confidence };
};

export function detectSpineRegions(image: RgbaImage): SpineRegion[] {
  if (image.width < 8 || image.height < 8 || image.data.length < image.width * image.height * 4) return [];
  const analyzed = downscale(image, ANALYSIS_MAX_WIDTH);
  const regions: SpineRegion[] = [];
  findShelfBands(analyzed).forEach((band, bandIndex) => {
    findSpinesInBand(analyzed, band).forEach((spine, index) => {
      regions.push(scaleRegion(spine, image, analyzed, `spine-${bandIndex + 1}-${index + 1}`));
    });
  });
  return regions;
}
