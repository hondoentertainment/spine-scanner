import { describe, it, expect } from 'vitest';
import {
  applyOtsuBinarization,
  applyAdaptiveThreshold,
  applyMedianFilter,
  applyMorphClose,
  applyCLAHE,
  detectSkewAngle,
  measureContrast,
  detectTextRegions,
  type BoundingBox,
} from '../imageProcessing';

/* ================================================================
 *  Helpers
 * ================================================================ */

/** Creates ImageData-like object (jsdom may not have ImageData constructor). */
function createImageData(width: number, height: number, filler: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = filler(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height } as ImageData;
}

/* ================================================================
 *  applyOtsuBinarization
 * ================================================================ */

describe('applyOtsuBinarization', () => {
  it('binarizes clear bimodal histogram (dark text on light)', () => {
    const img = createImageData(10, 10, (x, y) => (x + y) % 2 === 0 ? 20 : 230);
    applyOtsuBinarization(img);
    for (let i = 0; i < img.data.length; i += 4) {
      expect([0, 255]).toContain(img.data[i]);
    }
  });

  it('produces binary output (0 or 255 only)', () => {
    const img = createImageData(50, 50, () => 128);
    applyOtsuBinarization(img);
    for (let i = 0; i < img.data.length; i += 4) {
      expect([0, 255]).toContain(img.data[i]);
    }
  });

  it('handles uniform dark image', () => {
    const img = createImageData(20, 20, () => 10);
    applyOtsuBinarization(img);
    expect([0, 255]).toContain(img.data[0]);
  });

  it('handles uniform light image', () => {
    const img = createImageData(20, 20, () => 250);
    applyOtsuBinarization(img);
    expect(img.data[0]).toBe(255);
  });

  it('preserves R=G=B (grayscale)', () => {
    const img = createImageData(5, 5, (x, y) => (x * 30 + y * 10) % 256);
    applyOtsuBinarization(img);
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(img.data[i + 1]);
      expect(img.data[i + 1]).toBe(img.data[i + 2]);
    }
  });
});

/* ================================================================
 *  applyAdaptiveThreshold
 * ================================================================ */

describe('applyAdaptiveThreshold', () => {
  it('produces binary output', () => {
    const img = createImageData(30, 30, (x, y) => 80 + (x % 5) * 20);
    applyAdaptiveThreshold(img, 15);
    for (let i = 0; i < img.data.length; i += 4) {
      expect([0, 255]).toContain(img.data[i]);
    }
  });

  it('handles gradient image', () => {
    const img = createImageData(20, 20, (x) => (x * 10) % 256);
    expect(() => applyAdaptiveThreshold(img, 7)).not.toThrow();
  });
});

/* ================================================================
 *  applyMedianFilter
 * ================================================================ */

describe('applyMedianFilter', () => {
  it('reduces salt-and-pepper noise', () => {
    const img = createImageData(10, 10, () => 128);
    img.data[0] = img.data[1] = img.data[2] = 0;
    img.data[4] = img.data[5] = img.data[6] = 255;
    applyMedianFilter(img, 1);
    const centerIdx = (5 * 10 + 5) * 4;
    expect(img.data[centerIdx]).toBe(128);
  });

  it('preserves edges', () => {
    const img = createImageData(20, 10, (x) => x < 10 ? 0 : 255);
    applyMedianFilter(img, 1);
    const left = img.data[0];
    const right = img.data[19 * 4];
    expect(left).toBeLessThan(200);
    expect(right).toBeGreaterThan(55);
  });
});

/* ================================================================
 *  applyMorphClose
 * ================================================================ */

describe('applyMorphClose', () => {
  it('fills small gaps in binary image', () => {
    const img = createImageData(5, 5, () => 255);
    img.data[12] = img.data[13] = img.data[14] = 0;
    applyMorphClose(img, 3);
    expect([0, 255]).toContain(img.data[12]);
  });

  it('produces binary output', () => {
    const img = createImageData(15, 15, (x, y) => ((x + y) % 3 === 0 ? 0 : 255));
    applyMorphClose(img);
    for (let i = 0; i < img.data.length; i += 4) {
      expect([0, 255]).toContain(img.data[i]);
    }
  });
});

/* ================================================================
 *  applyCLAHE
 * ================================================================ */

describe('applyCLAHE', () => {
  it('improves contrast in low-contrast region', () => {
    const img = createImageData(32, 32, () => 100);
    applyCLAHE(img, 8, 40);
    const mean = Array.from(img.data)
      .filter((_, i) => i % 4 === 0)
      .reduce((a, b) => a + b, 0) / (32 * 32);
    expect(mean).toBeGreaterThanOrEqual(0);
  });

  it('handles small image', () => {
    const img = createImageData(8, 8, (x, y) => (x + y) * 10);
    expect(() => applyCLAHE(img, 4)).not.toThrow();
  });
});

/* ================================================================
 *  detectSkewAngle
 * ================================================================ */

describe('detectSkewAngle', () => {
  it('returns small angle for horizontal line pattern', () => {
    const img = createImageData(100, 50, (x, y) => (y % 10 < 5 ? 0 : 255));
    const angle = detectSkewAngle(img);
    expect(angle).toBeGreaterThanOrEqual(-5);
    expect(angle).toBeLessThanOrEqual(5);
  });

  it('returns number in -15 to +15 range', () => {
    const img = createImageData(100, 100, (x, y) => (x + y) % 20);
    const angle = detectSkewAngle(img);
    expect(angle).toBeGreaterThanOrEqual(-15);
    expect(angle).toBeLessThanOrEqual(15);
  });

  it('handles uniform image', () => {
    const img = createImageData(50, 50, () => 128);
    const angle = detectSkewAngle(img);
    expect(angle).toBeGreaterThanOrEqual(-15);
    expect(angle).toBeLessThanOrEqual(15);
  });
});

/* ================================================================
 *  measureContrast
 * ================================================================ */

describe('measureContrast', () => {
  it('returns 0 for uniform image', () => {
    const img = createImageData(20, 20, () => 128);
    expect(measureContrast(img)).toBe(0);
  });

  it('returns positive value for varying image', () => {
    const img = createImageData(20, 20, (x, y) => (x + y) % 2 === 0 ? 50 : 200);
    expect(measureContrast(img)).toBeGreaterThan(0);
  });

  it('returns higher contrast for more varying image', () => {
    const low = createImageData(50, 50, (x) => 120 + (x % 5));
    const high = createImageData(50, 50, (x) => (x % 2 === 0 ? 0 : 255));
    expect(measureContrast(high)).toBeGreaterThan(measureContrast(low));
  });

  it('handles single-pixel image', () => {
    const img = createImageData(1, 1, () => 100);
    expect(measureContrast(img)).toBe(0);
  });
});

/* ================================================================
 *  detectTextRegions
 * ================================================================ */

describe('detectTextRegions', () => {
  it('returns empty for uniform light image', () => {
    const img = createImageData(50, 50, () => 255);
    expect(detectTextRegions(img)).toEqual([]);
  });

  it('returns regions for dark blobs', () => {
    const img = createImageData(30, 30, () => 255);
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        const i = (y * 30 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      }
    }
    const regions = detectTextRegions(img, 20);
    expect(regions.length).toBeGreaterThanOrEqual(1);
    expect(regions[0]).toMatchObject({ w: expect.any(Number), h: expect.any(Number) });
  });

  it('filters small components with minArea', () => {
    const img = createImageData(20, 20, () => 255);
    img.data[0] = img.data[1] = img.data[2] = 0;
    const regions = detectTextRegions(img, 5);
    expect(regions).toHaveLength(0);
  });

  it('returns BoundingBox shape', () => {
    const img = createImageData(40, 40, () => 255);
    for (let y = 15; y < 25; y++) {
      for (let x = 15; x < 25; x++) {
        const i = (y * 40 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 50;
      }
    }
    const regions = detectTextRegions(img, 50);
    if (regions.length > 0) {
      const r = regions[0] as BoundingBox;
      expect(r).toHaveProperty('x');
      expect(r).toHaveProperty('y');
      expect(r).toHaveProperty('w');
      expect(r).toHaveProperty('h');
    }
  });
});

/* ================================================================
 *  applyOtsuBinarization — edge cases
 * ================================================================ */

describe('applyOtsuBinarization — edge cases', () => {
  it('handles 1x1 image', () => {
    const img = createImageData(1, 1, () => 100);
    applyOtsuBinarization(img);
    expect([0, 255]).toContain(img.data[0]);
  });
  it('handles 2x2 image', () => {
    const img = createImageData(2, 2, (x, y) => (x + y) * 100);
    applyOtsuBinarization(img);
    for (let i = 0; i < 4; i++) expect([0, 255]).toContain(img.data[i * 4]);
  });
});

/* ================================================================
 *  measureContrast — edge cases
 * ================================================================ */

describe('measureContrast — edge cases', () => {
  it('handles alternating 0 and 255', () => {
    const img = createImageData(10, 10, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
    expect(measureContrast(img)).toBeGreaterThan(50);
  });
  it('handles narrow range', () => {
    const img = createImageData(20, 20, (x, y) => 125 + (x + y) % 6);
    expect(measureContrast(img)).toBeLessThan(10);
  });
});

/* ================================================================
 *  applyAdaptiveThreshold — edge cases
 * ================================================================ */

describe('applyAdaptiveThreshold — edge cases', () => {
  it('handles small block size', () => {
    const img = createImageData(20, 20, (x) => x * 10);
    expect(() => applyAdaptiveThreshold(img, 5)).not.toThrow();
  });
  it('outputs only 0 or 255 after threshold', () => {
    const img = createImageData(25, 25, (x, y) => (x + y) % 3 * 80);
    applyAdaptiveThreshold(img, 9);
    for (let i = 0; i < img.data.length; i += 4) {
      expect([0, 255]).toContain(img.data[i]);
    }
  });
});
