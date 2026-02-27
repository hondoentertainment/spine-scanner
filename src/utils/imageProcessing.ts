/**
 * Advanced image-processing utilities for OCR preprocessing.
 *
 * Every function operates on browser-native ImageData (RGBA Uint8ClampedArray)
 * or HTMLCanvasElement and requires no external dependencies.
 * Input is assumed to be already grayscale (R=G=B) unless noted otherwise.
 */

/* ================================================================
 *  Types
 * ================================================================ */

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PerspectiveCorners {
  tl: [number, number];
  tr: [number, number];
  bl: [number, number];
  br: [number, number];
}

/* ================================================================
 *  1. Otsu binarization
 * ================================================================ */

/**
 * Otsu's adaptive binarization.
 *
 * Computes the single threshold that minimises intra-class variance between
 * foreground and background pixel populations.  Highly effective when the
 * histogram is bimodal (dark text on light paper).
 *
 * OCR benefit: converts noisy grayscale into clean black/white, giving
 * Tesseract a much crisper signal with less ambiguity.
 *
 * Modifies `imageData` in-place (R=G=B set to 0 or 255).
 */
export function applyOtsuBinarization(imageData: ImageData): void {
  try {
    const data = imageData.data;
    const totalPixels = imageData.width * imageData.height;

    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      histogram[data[i]]++;
    }

    let sumTotal = 0;
    for (let t = 0; t < 256; t++) sumTotal += t * histogram[t];

    let sumBg = 0;
    let weightBg = 0;
    let maxVariance = 0;
    let bestThreshold = 0;

    for (let t = 0; t < 256; t++) {
      weightBg += histogram[t];
      if (weightBg === 0) continue;
      const weightFg = totalPixels - weightBg;
      if (weightFg === 0) break;

      sumBg += t * histogram[t];
      const meanBg = sumBg / weightBg;
      const meanFg = (sumTotal - sumBg) / weightFg;
      const diff = meanBg - meanFg;
      const variance = weightBg * weightFg * diff * diff;

      if (variance > maxVariance) {
        maxVariance = variance;
        bestThreshold = t;
      }
    }

    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] < bestThreshold ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  } catch { /* graceful no-op */ }
}

/* ================================================================
 *  2. Sauvola adaptive threshold (integral-image accelerated)
 * ================================================================ */

/**
 * Sauvola-style local adaptive thresholding.
 *
 * For each pixel the threshold is:
 *   T = mean * (1 + k * (stddev / R - 1))
 * where `mean` and `stddev` are computed over a `blockSize × blockSize`
 * window, k = 0.2, R = 128.
 *
 * Uses integral images (summed-area tables) for O(1) per-pixel mean/variance,
 * making the total cost O(W*H) regardless of window size.
 *
 * OCR benefit: handles uneven lighting far better than a single global
 * threshold — critical for book spines photographed under mixed lighting.
 *
 * Modifies `imageData` in-place.
 */
export function applyAdaptiveThreshold(
  imageData: ImageData,
  blockSize = 15,
  C: number = 0,
): void {
  try {
    const { width: w, height: h, data } = imageData;
    const totalPx = w * h;
    const half = (blockSize >> 1) || 7;
    const k = 0.2;
    const R = 128;
    void C; // reserved for future use

    const gray = new Float64Array(totalPx);
    for (let i = 0; i < totalPx; i++) gray[i] = data[i * 4];

    // Integral image for sum and sum-of-squares
    const intSum = new Float64Array(totalPx);
    const intSqSum = new Float64Array(totalPx);

    // First pixel
    intSum[0] = gray[0];
    intSqSum[0] = gray[0] * gray[0];

    // First row
    for (let x = 1; x < w; x++) {
      intSum[x] = intSum[x - 1] + gray[x];
      intSqSum[x] = intSqSum[x - 1] + gray[x] * gray[x];
    }

    // First column
    for (let y = 1; y < h; y++) {
      const idx = y * w;
      intSum[idx] = intSum[idx - w] + gray[idx];
      intSqSum[idx] = intSqSum[idx - w] + gray[idx] * gray[idx];
    }

    // Rest
    for (let y = 1; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const idx = y * w + x;
        intSum[idx] =
          gray[idx] + intSum[idx - 1] + intSum[idx - w] - intSum[idx - w - 1];
        intSqSum[idx] =
          gray[idx] * gray[idx] +
          intSqSum[idx - 1] +
          intSqSum[idx - w] -
          intSqSum[idx - w - 1];
      }
    }

    const at = (table: Float64Array, x: number, y: number): number => {
      if (x < 0 || y < 0) return 0;
      return table[y * w + x];
    };

    const out = new Uint8Array(totalPx);

    for (let y = 0; y < h; y++) {
      const y1 = Math.max(y - half - 1, -1);
      const y2 = Math.min(y + half, h - 1);
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(x - half - 1, -1);
        const x2 = Math.min(x + half, w - 1);
        const count = (x2 - x1) * (y2 - y1);
        const sum = at(intSum, x2, y2) - at(intSum, x1, y2) - at(intSum, x2, y1) + at(intSum, x1, y1);
        const sqSum = at(intSqSum, x2, y2) - at(intSqSum, x1, y2) - at(intSqSum, x2, y1) + at(intSqSum, x1, y1);

        const mean = sum / count;
        const variance = sqSum / count - mean * mean;
        const stddev = Math.sqrt(Math.max(variance, 0));
        const threshold = mean * (1 + k * (stddev / R - 1));

        out[y * w + x] = gray[y * w + x] >= threshold ? 255 : 0;
      }
    }

    for (let i = 0; i < totalPx; i++) {
      const v = out[i];
      const off = i * 4;
      data[off] = data[off + 1] = data[off + 2] = v;
    }
  } catch { /* graceful no-op */ }
}

/* ================================================================
 *  3. Median filter
 * ================================================================ */

/**
 * Median filter (default 3×3 window, radius = 1).
 *
 * For each pixel, collects neighborhood values, sorts, and selects the
 * median.  Operates on the R channel (copies result to G and B).
 *
 * OCR benefit: removes salt-and-pepper noise common in phone-camera captures
 * while preserving edges — important for keeping character boundaries intact.
 *
 * Modifies `imageData` in-place.
 */
export function applyMedianFilter(imageData: ImageData, radius = 1): void {
  try {
    const { width: w, height: h, data } = imageData;
    const src = new Uint8Array(w * h);
    for (let i = 0; i < src.length; i++) src[i] = data[i * 4];

    const side = 2 * radius + 1;
    const buf = new Uint8Array(side * side);

    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        let n = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            buf[n++] = src[(y + dy) * w + (x + dx)];
          }
        }
        // Partial sort to find median (selection for small n)
        const sub = buf.subarray(0, n);
        sub.sort();
        const med = sub[n >> 1];
        const off = (y * w + x) * 4;
        data[off] = data[off + 1] = data[off + 2] = med;
      }
    }
  } catch { /* graceful no-op */ }
}

/* ================================================================
 *  4. Morphological close (dilate then erode)
 * ================================================================ */

/**
 * Morphological closing on a binarised image (dilate → erode).
 *
 * Uses a square structuring element of `kernelSize` (default 3).
 * Dilation sets a pixel to the **max** in its neighborhood; erosion sets it
 * to the **min**.  The combined close operation fills small gaps without
 * significantly enlarging character strokes.
 *
 * OCR benefit: reconnects broken character strokes on worn or faded book
 * spines, improving recognition of partially printed digits.
 *
 * Modifies `imageData` in-place.
 */
export function applyMorphClose(imageData: ImageData, kernelSize = 3): void {
  try {
    const { width: w, height: h, data } = imageData;
    const totalPx = w * h;
    const half = kernelSize >> 1;

    const gray = new Uint8Array(totalPx);
    for (let i = 0; i < totalPx; i++) gray[i] = data[i * 4];

    // Dilate: max in neighborhood
    const dilated = new Uint8Array(totalPx);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let max = 0;
        for (let ky = -half; ky <= half; ky++) {
          const ny = y + ky;
          if (ny < 0 || ny >= h) continue;
          for (let kx = -half; kx <= half; kx++) {
            const nx = x + kx;
            if (nx < 0 || nx >= w) continue;
            const v = gray[ny * w + nx];
            if (v > max) max = v;
          }
        }
        dilated[y * w + x] = max;
      }
    }

    // Erode: min in neighborhood
    const eroded = new Uint8Array(totalPx);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let min = 255;
        for (let ky = -half; ky <= half; ky++) {
          const ny = y + ky;
          if (ny < 0 || ny >= h) continue;
          for (let kx = -half; kx <= half; kx++) {
            const nx = x + kx;
            if (nx < 0 || nx >= w) continue;
            const v = dilated[ny * w + nx];
            if (v < min) min = v;
          }
        }
        eroded[y * w + x] = min;
      }
    }

    for (let i = 0; i < totalPx; i++) {
      const v = eroded[i];
      const off = i * 4;
      data[off] = data[off + 1] = data[off + 2] = v;
    }
  } catch { /* graceful no-op */ }
}

/* ================================================================
 *  5. CLAHE — Contrast Limited Adaptive Histogram Equalization
 * ================================================================ */

/**
 * Contrast Limited Adaptive Histogram Equalization (CLAHE).
 *
 * 1. Divides image into a grid of tiles (default 8×8).
 * 2. For each tile, builds a 256-bin histogram, clips counts that exceed
 *    `clipLimit` (default 40), and redistributes the clipped portion evenly.
 * 3. Computes a CDF-based mapping per tile.
 * 4. For each pixel, bilinearly interpolates between the four nearest tile
 *    mappings for smooth transitions (no tile-boundary artifacts).
 *
 * OCR benefit: equalises exposure across the spine so text at both the bright
 * and dark ends becomes readable — a common issue with curved book spines.
 *
 * Modifies `imageData` in-place.
 */
export function applyCLAHE(
  imageData: ImageData,
  tileSize = 8,
  clipLimit = 40,
): void {
  try {
    const { width: w, height: h, data } = imageData;
    const tilesX = tileSize;
    const tilesY = tileSize;
    const tileW = w / tilesX;
    const tileH = h / tilesY;

    // Build per-tile CDF mappings
    const mappings: Uint8Array[] = new Array(tilesX * tilesY);

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = Math.round(tx * tileW);
        const y0 = Math.round(ty * tileH);
        const x1 = Math.round((tx + 1) * tileW);
        const y1 = Math.round((ty + 1) * tileH);

        const hist = new Uint32Array(256);
        let count = 0;
        for (let y = y0; y < y1 && y < h; y++) {
          for (let x = x0; x < x1 && x < w; x++) {
            hist[data[(y * w + x) * 4]]++;
            count++;
          }
        }

        if (count === 0) {
          mappings[ty * tilesX + tx] = new Uint8Array(256).fill(0);
          continue;
        }

        // Clip histogram and redistribute
        const limit = Math.max(1, Math.round((clipLimit * count) / 256));
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i] > limit) {
            excess += hist[i] - limit;
            hist[i] = limit;
          }
        }
        const bonus = Math.floor(excess / 256);
        const remainder = excess - bonus * 256;
        for (let i = 0; i < 256; i++) hist[i] += bonus;
        // Spread remainder across bins starting at the step interval
        const step = Math.max(1, Math.floor(256 / (remainder + 1)));
        for (let i = 0, r = 0; r < remainder && i < 256; i += step, r++) {
          hist[i]++;
        }

        // CDF mapping
        const map = new Uint8Array(256);
        let cdf = 0;
        for (let i = 0; i < 256; i++) {
          cdf += hist[i];
          map[i] = Math.round((cdf / count) * 255);
        }
        mappings[ty * tilesX + tx] = map;
      }
    }

    // Apply with bilinear interpolation between tile mappings
    for (let y = 0; y < h; y++) {
      // Tile-centre-relative position
      const fy = (y / tileH) - 0.5;
      let ty0 = Math.floor(fy);
      let ty1 = ty0 + 1;
      const wy = fy - ty0;
      ty0 = Math.max(0, Math.min(ty0, tilesY - 1));
      ty1 = Math.max(0, Math.min(ty1, tilesY - 1));

      for (let x = 0; x < w; x++) {
        const fx = (x / tileW) - 0.5;
        let tx0 = Math.floor(fx);
        let tx1 = tx0 + 1;
        const wx = fx - tx0;
        tx0 = Math.max(0, Math.min(tx0, tilesX - 1));
        tx1 = Math.max(0, Math.min(tx1, tilesX - 1));

        const off = (y * w + x) * 4;
        const v = data[off];

        const m00 = mappings[ty0 * tilesX + tx0][v];
        const m10 = mappings[ty0 * tilesX + tx1][v];
        const m01 = mappings[ty1 * tilesX + tx0][v];
        const m11 = mappings[ty1 * tilesX + tx1][v];

        const top = m00 + (m10 - m00) * wx;
        const bot = m01 + (m11 - m01) * wx;
        const val = Math.round(top + (bot - top) * wy);

        data[off] = data[off + 1] = data[off + 2] = Math.max(0, Math.min(255, val));
      }
    }
  } catch { /* graceful no-op */ }
}

/* ================================================================
 *  6. Projection-profile skew detection
 * ================================================================ */

/**
 * Detects the skew angle of text in a binarised / grayscale image using
 * horizontal projection profiles.
 *
 * Algorithm:
 *  1. Down-sample the image to ≤ 400 px wide for speed.
 *  2. For candidate angles from −15° to +15° (0.5° steps), rotate and
 *     compute the horizontal projection (sum of dark pixels per row).
 *  3. The angle whose profile has the highest variance is the most likely
 *     text orientation — horizontal text lines create sharp peaks.
 *
 * OCR benefit: even a 2–3° tilt degrades Tesseract accuracy.  Correcting
 * skew before recognition markedly improves results on hand-held captures.
 *
 * Returns the detected angle in degrees (positive = counter-clockwise).
 */
export function detectSkewAngle(imageData: ImageData): number {
  try {
    const { width: w, height: h, data } = imageData;

    // Down-sample for speed
    const maxW = 400;
    const scale = w > maxW ? maxW / w : 1;
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);

    const gray = new Uint8Array(sw * sh);
    if (scale < 1) {
      for (let y = 0; y < sh; y++) {
        const srcY = Math.min(Math.round(y / scale), h - 1);
        for (let x = 0; x < sw; x++) {
          const srcX = Math.min(Math.round(x / scale), w - 1);
          gray[y * sw + x] = data[(srcY * w + srcX) * 4];
        }
      }
    } else {
      for (let i = 0; i < w * h; i++) gray[i] = data[i * 4];
    }

    // Binarise at 128 if not already binary
    for (let i = 0; i < gray.length; i++) {
      gray[i] = gray[i] < 128 ? 1 : 0; // 1 = dark (text)
    }

    const cx = sw / 2;
    const cy = sh / 2;

    let bestAngle = 0;
    let bestVariance = -1;

    for (let angleDeg = -15; angleDeg <= 15; angleDeg += 0.5) {
      const rad = (angleDeg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      // Projection profile: count dark pixels per row after rotation
      const profile = new Float64Array(sh);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          // Rotate point around centre
          const rx = cosA * (x - cx) - sinA * (y - cy) + cx;
          const ry = sinA * (x - cx) + cosA * (y - cy) + cy;
          const ix = Math.round(rx);
          const iy = Math.round(ry);
          if (ix >= 0 && ix < sw && iy >= 0 && iy < sh) {
            profile[y] += gray[iy * sw + ix];
          }
        }
      }

      // Variance of projection
      let sum = 0;
      let sumSq = 0;
      for (let i = 0; i < sh; i++) {
        sum += profile[i];
        sumSq += profile[i] * profile[i];
      }
      const mean = sum / sh;
      const variance = sumSq / sh - mean * mean;

      if (variance > bestVariance) {
        bestVariance = variance;
        bestAngle = angleDeg;
      }
    }

    return bestAngle;
  } catch {
    return 0;
  }
}

/* ================================================================
 *  7. Connected-component text-region detection
 * ================================================================ */

/**
 * Connected-component analysis on a binarised image.
 *
 * Uses 4-connectivity flood-fill to label dark-pixel groups, filters out
 * components smaller than `minArea` (default 20 px), then merges nearby
 * bounding boxes into text-line regions (within 10 px vertically).
 * Results are sorted by area descending.
 *
 * OCR benefit: isolating text regions lets subsequent OCR passes focus on
 * just the relevant parts of the image, reducing noise and false positives.
 *
 * Returns bounding boxes of detected text regions.
 */
export function detectTextRegions(
  imageData: ImageData,
  minArea = 20,
): BoundingBox[] {
  try {
    const { width: w, height: h, data } = imageData;
    const totalPx = w * h;

    const binary = new Uint8Array(totalPx);
    for (let i = 0; i < totalPx; i++) {
      binary[i] = data[i * 4] < 128 ? 1 : 0;
    }

    const labels = new Int32Array(totalPx);
    let nextLabel = 1;

    const boxes: Map<number, { minX: number; minY: number; maxX: number; maxY: number; area: number }> = new Map();

    // 4-connectivity flood-fill using a stack (no recursion)
    const stack: number[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (binary[idx] === 0 || labels[idx] !== 0) continue;

        const label = nextLabel++;
        const box = { minX: x, minY: y, maxX: x, maxY: y, area: 0 };
        stack.length = 0;
        stack.push(idx);
        labels[idx] = label;

        while (stack.length > 0) {
          const ci = stack.pop()!;
          const cy = (ci / w) | 0;
          const cx = ci - cy * w;

          box.area++;
          if (cx < box.minX) box.minX = cx;
          if (cx > box.maxX) box.maxX = cx;
          if (cy < box.minY) box.minY = cy;
          if (cy > box.maxY) box.maxY = cy;

          // 4-connected neighbors: up, down, left, right
          if (cy > 0) {
            const ni = ci - w;
            if (binary[ni] === 1 && labels[ni] === 0) {
              labels[ni] = label;
              stack.push(ni);
            }
          }
          if (cy < h - 1) {
            const ni = ci + w;
            if (binary[ni] === 1 && labels[ni] === 0) {
              labels[ni] = label;
              stack.push(ni);
            }
          }
          if (cx > 0) {
            const ni = ci - 1;
            if (binary[ni] === 1 && labels[ni] === 0) {
              labels[ni] = label;
              stack.push(ni);
            }
          }
          if (cx < w - 1) {
            const ni = ci + 1;
            if (binary[ni] === 1 && labels[ni] === 0) {
              labels[ni] = label;
              stack.push(ni);
            }
          }
        }

        if (box.area >= minArea) {
          boxes.set(label, box);
        }
      }
    }

    // Convert to BoundingBox array
    let regions: BoundingBox[] = Array.from(boxes.values()).map((b) => ({
      x: b.minX,
      y: b.minY,
      w: b.maxX - b.minX + 1,
      h: b.maxY - b.minY + 1,
    }));

    // Merge boxes within 10px vertically into text-line regions
    const MERGE_GAP = 10;
    regions.sort((a, b) => a.y - b.y);

    const merged: BoundingBox[] = [];
    for (const r of regions) {
      let didMerge = false;
      for (let i = 0; i < merged.length; i++) {
        const m = merged[i];
        const verticalOverlap =
          r.y <= m.y + m.h + MERGE_GAP && r.y + r.h >= m.y - MERGE_GAP;
        if (verticalOverlap) {
          const nx = Math.min(m.x, r.x);
          const ny = Math.min(m.y, r.y);
          merged[i] = {
            x: nx,
            y: ny,
            w: Math.max(m.x + m.w, r.x + r.w) - nx,
            h: Math.max(m.y + m.h, r.y + r.h) - ny,
          };
          didMerge = true;
          break;
        }
      }
      if (!didMerge) merged.push({ ...r });
    }

    // Sort by area descending
    merged.sort((a, b) => b.w * b.h - a.w * a.h);
    return merged;
  } catch {
    return [];
  }
}

/* ================================================================
 *  8. Contrast measurement
 * ================================================================ */

/**
 * Computes the standard deviation of grayscale pixel values.
 *
 * A value < 30 indicates a low-contrast image that would benefit from
 * histogram equalization or CLAHE before OCR.
 *
 * OCR benefit: provides a fast quality signal so the pipeline can choose
 * appropriate preprocessing (e.g. skip expensive passes on high-contrast
 * images, or add CLAHE on low-contrast ones).
 *
 * Returns the standard deviation (0–127.5 range).
 */
export function measureContrast(imageData: ImageData): number {
  try {
    const data = imageData.data;
    const n = imageData.width * imageData.height;
    if (n === 0) return 0;

    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      sum += v;
      sumSq += v * v;
    }

    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return Math.sqrt(Math.max(variance, 0));
  } catch {
    return 0;
  }
}

/* ================================================================
 *  9. Perspective correction
 * ================================================================ */

/**
 * Applies a projective (perspective) transform to rectify a document region
 * defined by four corner points.
 *
 * Computes the 8-parameter perspective matrix that maps the source
 * quadrilateral to a destination rectangle, then uses inverse mapping to
 * fill each output pixel from the correct source location.
 *
 * OCR benefit: corrects keystoning and perspective distortion from angled
 * phone captures, producing a flat rectangular image that Tesseract can
 * read as if it were a flatbed scan.
 *
 * Modifies the `canvas` in-place.
 */
export function applyPerspectiveCorrection(
  canvas: HTMLCanvasElement,
  corners: PerspectiveCorners,
): void {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { tl, tr, bl, br } = corners;

    // Destination rectangle dimensions (max of top/bottom width, left/right height)
    const dstW = Math.round(
      Math.max(
        Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
        Math.hypot(br[0] - bl[0], br[1] - bl[1]),
      ),
    );
    const dstH = Math.round(
      Math.max(
        Math.hypot(bl[0] - tl[0], bl[1] - tl[1]),
        Math.hypot(br[0] - tr[0], br[1] - tr[1]),
      ),
    );

    if (dstW <= 0 || dstH <= 0) return;

    const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const srcW = canvas.width;
    const srcH = canvas.height;
    const src = srcData.data;

    // Solve for the 3×3 perspective matrix that maps dst → src
    // dst corners: (0,0), (dstW,0), (dstW,dstH), (0,dstH)
    // src corners: tl, tr, br, bl
    const coeffs = solvePerspective(
      [0, 0], [dstW, 0], [dstW, dstH], [0, dstH],
      tl, tr, br, bl,
    );

    if (!coeffs) return;

    canvas.width = dstW;
    canvas.height = dstH;
    const dstImgData = ctx.createImageData(dstW, dstH);
    const dst = dstImgData.data;

    // Inverse mapping: for each output pixel, find the source pixel
    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const denom = coeffs[6] * x + coeffs[7] * y + 1;
        if (Math.abs(denom) < 1e-10) continue;

        const sx = (coeffs[0] * x + coeffs[1] * y + coeffs[2]) / denom;
        const sy = (coeffs[3] * x + coeffs[4] * y + coeffs[5]) / denom;

        const ix = Math.round(sx);
        const iy = Math.round(sy);
        if (ix < 0 || ix >= srcW || iy < 0 || iy >= srcH) continue;

        const dOff = (y * dstW + x) * 4;
        const sOff = (iy * srcW + ix) * 4;
        dst[dOff] = src[sOff];
        dst[dOff + 1] = src[sOff + 1];
        dst[dOff + 2] = src[sOff + 2];
        dst[dOff + 3] = src[sOff + 3];
      }
    }

    ctx.putImageData(dstImgData, 0, 0);
  } catch { /* graceful no-op */ }
}

/* ----------------------------------------------------------------
 *  Perspective matrix solver (8-parameter DLT)
 *
 *  Maps four dst points to four src points via a 3×3 homography.
 *  Returns the 8 coefficients [a,b,c,d,e,f,g,h] of:
 *    x' = (a*x + b*y + c) / (g*x + h*y + 1)
 *    y' = (d*x + e*y + f) / (g*x + h*y + 1)
 * ---------------------------------------------------------------- */
function solvePerspective(
  d0: [number, number], d1: [number, number],
  d2: [number, number], d3: [number, number],
  s0: [number, number], s1: [number, number],
  s2: [number, number], s3: [number, number],
): Float64Array | null {
  // 8×8 system from 4 point correspondences
  const A = [
    [d0[0], d0[1], 1, 0, 0, 0, -s0[0] * d0[0], -s0[0] * d0[1]],
    [0, 0, 0, d0[0], d0[1], 1, -s0[1] * d0[0], -s0[1] * d0[1]],
    [d1[0], d1[1], 1, 0, 0, 0, -s1[0] * d1[0], -s1[0] * d1[1]],
    [0, 0, 0, d1[0], d1[1], 1, -s1[1] * d1[0], -s1[1] * d1[1]],
    [d2[0], d2[1], 1, 0, 0, 0, -s2[0] * d2[0], -s2[0] * d2[1]],
    [0, 0, 0, d2[0], d2[1], 1, -s2[1] * d2[0], -s2[1] * d2[1]],
    [d3[0], d3[1], 1, 0, 0, 0, -s3[0] * d3[0], -s3[0] * d3[1]],
    [0, 0, 0, d3[0], d3[1], 1, -s3[1] * d3[0], -s3[1] * d3[1]],
  ];
  const b = [s0[0], s0[1], s1[0], s1[1], s2[0], s2[1], s3[0], s3[1]];

  // Gaussian elimination with partial pivoting
  const n = 8;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(M[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-12) return null;
    if (maxRow !== col) { const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp; }

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  const result = new Float64Array(8);
  for (let i = 0; i < 8; i++) result[i] = M[i][n];
  return result;
}
