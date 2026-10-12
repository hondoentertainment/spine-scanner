import { describe, expect, it } from 'vitest';
import { detectSpineRegions } from '../detectSpines.ts';
import { fillRect, shelfRowImage, solidImage } from './imageFixture.ts';

describe('detectSpineRegions', () => {
  it('finds each colored spine on one shelf', () => {
    const regions = detectSpineRegions(shelfRowImage());
    expect(regions.map((region) => region.x)).toEqual([10, 86, 162]);
    expect(regions.every((region) => region.width >= 60 && region.height > 40)).toBe(true);
    expect(regions.map((region) => region.id)).toEqual(['spine-1-1', 'spine-1-2', 'spine-1-3']);
  });

  it('splits two shelf rows into separate spines', () => {
    const image = solidImage(320, 180, [245, 245, 245]);
    fillRect(image, 10, 12, 70, 58, [170, 42, 42]);
    fillRect(image, 86, 12, 70, 58, [36, 72, 168]);
    fillRect(image, 162, 12, 70, 58, [36, 130, 72]);
    fillRect(image, 12, 108, 90, 56, [120, 48, 150]);
    fillRect(image, 112, 108, 90, 56, [200, 140, 40]);

    const regions = detectSpineRegions(image);
    expect(regions).toHaveLength(5);
    expect(regions.filter((region) => region.y < 90)).toHaveLength(3);
    expect(regions.filter((region) => region.y > 90)).toHaveLength(2);
  });

  it('returns no spines for a blank photo', () => {
    expect(detectSpineRegions(solidImage(200, 80, [250, 250, 250]))).toEqual([]);
  });

  it('keeps a single book standing on a contrasting background', () => {
    const image = solidImage(240, 100, [245, 245, 245]);
    fillRect(image, 70, 10, 90, 80, [28, 90, 150]);
    const regions = detectSpineRegions(image);
    expect(regions).toHaveLength(1);
    expect(regions[0].x).toBeGreaterThan(50);
    expect(regions[0].width).toBeGreaterThan(70);
  });

  it('still finds spines after the analysis image is downscaled', () => {
    const image = solidImage(960, 220, [245, 245, 245]);
    fillRect(image, 30, 20, 210, 180, [170, 42, 42]);
    fillRect(image, 258, 20, 210, 180, [36, 72, 168]);
    fillRect(image, 486, 20, 210, 180, [36, 130, 72]);
    const regions = detectSpineRegions(image);
    expect(regions).toHaveLength(3);
    expect(regions[0].x).toBeLessThan(regions[1].x);
    expect(regions[1].x).toBeLessThan(regions[2].x);
  });
});
