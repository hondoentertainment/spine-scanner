import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropSpineToDataUrl, loadImageElement, readImagePixels } from '../imageCanvas.ts';
import type { SpineRegion } from '../types.ts';

const region: SpineRegion = { id: 'spine-1', x: 1, y: 2, width: 4, height: 20, confidence: 0.8 };

describe('imageCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads pixel data from a loaded image', () => {
    const data = new Uint8ClampedArray(16 * 12 * 4);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage() {},
      getImageData: () => ({ data, width: 16, height: 12 }),
    } as unknown as CanvasRenderingContext2D);

    const pixels = readImagePixels({ naturalWidth: 16, naturalHeight: 12 } as HTMLImageElement);
    expect(pixels.width).toBe(16);
    expect(pixels.height).toBe(12);
    expect(pixels.data).toBe(data);
  });

  it('rotates a tall spine crop for OCR', () => {
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,crop');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage() {},
      translate() {},
      rotate() {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL);

    expect(cropSpineToDataUrl({} as HTMLImageElement, region)).toBe('data:image/jpeg;base64,crop');
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('rejects images that are too small to segment', () => {
    expect(() => readImagePixels({ naturalWidth: 4, naturalHeight: 4 } as HTMLImageElement)).toThrow(/too small/);
  });

  it('loads an image element once it decodes', async () => {
    const Original = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: ((err?: unknown) => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;
    try {
      await expect(loadImageElement('data:image/gif;base64,')).resolves.toBeInstanceOf(FakeImage);
    } finally {
      globalThis.Image = Original;
    }
  });
});
