import { describe, expect, it, vi } from 'vitest';
import { runBrowserShelfScan } from '../runBrowserShelfScan.ts';
import type { RgbaImage } from '../types.ts';
import { shelfRowImage } from './imageFixture.ts';

describe('runBrowserShelfScan', () => {
  it('crops each detected spine, then returns review rows with those previews', async () => {
    const image = shelfRowImage();
    const crops: string[] = [];
    const items = await runBrowserShelfScan('data:image/jpeg;base64,shelf', {
      loadImage: async () => ({ width: image.width, height: image.height }) as HTMLImageElement,
      readPixels: () => image,
      crop: (_img, region) => {
        const url = `data:image/jpeg;base64,${region.id}`;
        crops.push(url);
        return url;
      },
      fetchVision: async () => null,
      decodeBarcode: async () => null,
      lookupByIsbn: async () => null,
      lookupByQuery: async () => null,
      recognizeText: async (cropUrl) => ({
        text: cropUrl.endsWith('spine-1-1')
          ? 'The Left Hand of Darkness\nby Ursula K. Le Guin\n9780441478125'
          : 'Plain spine',
        confidence: 80,
      }),
    });

    expect(crops.length).toBeGreaterThanOrEqual(3);
    expect(items[0]).toMatchObject({
      id: 'spine-1-1',
      title: 'The Left Hand of Darkness',
      isbn: '9780441478125',
      previewUrl: 'data:image/jpeg;base64,spine-1-1',
      decision: 'accept',
    });
    expect(items[1].previewUrl).toBe('data:image/jpeg;base64,spine-1-2');
  });

  it('does not look books up when the browser is offline and no lookup is injected', async () => {
    const image: RgbaImage = shelfRowImage();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const items = await runBrowserShelfScan('data:image/jpeg;base64,shelf', {
        loadImage: async () => ({ width: image.width, height: image.height }) as HTMLImageElement,
        readPixels: () => image,
        crop: () => 'data:image/jpeg;base64,crop',
        fetchVision: async () => null,
        decodeBarcode: async () => null,
        recognizeText: async () => ({ text: 'Dune\nFrank Herbert', confidence: 70 }),
      });
      expect(items[0].title).toBe('Dune');
      expect(items[0].metadataSource).toBe('manual');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
      fetchSpy.mockRestore();
    }
  });
});
