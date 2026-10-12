import { decodeSpineBarcode } from './decodeSpineBarcode.ts';
import { cropSpineToDataUrl, loadImageElement, readImagePixels } from './imageCanvas.ts';
import { scanShelfPhoto } from './scanShelf.ts';
import { lookupShelfByIsbn, lookupShelfByTitleAuthor } from './shelfLookup.ts';
import { fetchShelfVisionBooks } from './shelfVision.ts';
import type { RgbaImage, ShelfMetadataHit, ShelfReviewItem, SpineRegion, VisionShelfBook } from './types.ts';

export interface BrowserShelfHooks {
  recognizeText: (cropUrl: string, regionId: string) => Promise<{ text: string; confidence?: number }>;
  decodeBarcode?: (cropUrl: string) => Promise<string | null>;
  lookupByIsbn?: (isbn: string) => Promise<ShelfMetadataHit | null>;
  lookupByQuery?: (title: string, author: string) => Promise<ShelfMetadataHit | null>;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  loadImage?: (src: string) => Promise<HTMLImageElement>;
  readPixels?: (img: HTMLImageElement) => RgbaImage;
  crop?: (img: HTMLImageElement, region: SpineRegion) => string;
  fetchVision?: (src: string) => Promise<VisionShelfBook[] | null>;
}

const canLookupByDefault = (): boolean => (
  typeof navigator === 'undefined' || navigator.onLine !== false
);

/**
 * Browser entry: load pixels, optionally ask a configured vision endpoint,
 * then run the on-device detect → OCR/barcode → metadata → review pipeline.
 */
export async function runBrowserShelfScan(
  dataUrl: string,
  hooks: BrowserShelfHooks,
): Promise<ShelfReviewItem[]> {
  const loadImage = hooks.loadImage ?? loadImageElement;
  const readPixels = hooks.readPixels ?? readImagePixels;
  const crop = hooks.crop ?? cropSpineToDataUrl;
  const fetchVision = hooks.fetchVision ?? fetchShelfVisionBooks;
  const online = canLookupByDefault();
  const lookupByIsbn = hooks.lookupByIsbn ?? (online ? lookupShelfByIsbn : async () => null);
  const lookupByQuery = hooks.lookupByQuery ?? (
    online ? (title: string, author: string) => lookupShelfByTitleAuthor(title, author) : async () => null
  );

  const img = await loadImage(dataUrl);
  const visionPromise = fetchVision(dataUrl).catch(() => null);
  const image = readPixels(img);
  const visionBooks = await visionPromise;
  const crops = new Map<string, string>();
  const cropOf = (region: SpineRegion): string => {
    const cached = crops.get(region.id);
    if (cached !== undefined) return cached;
    const url = crop(img, region);
    crops.set(region.id, url);
    return url;
  };

  const items = await scanShelfPhoto(image, {
    visionBooks,
    signal: hooks.signal,
    onProgress: hooks.onProgress,
    lookupByIsbn,
    lookupByQuery,
    decodeBarcode: async (region) => {
      const url = cropOf(region);
      if (!url) return null;
      const decode = hooks.decodeBarcode ?? decodeSpineBarcode;
      return decode(url);
    },
    recognizeText: async (region) => {
      const url = cropOf(region);
      if (!url) return { text: '', confidence: 0 };
      return hooks.recognizeText(url, region.id);
    },
  });

  return items.map((item) => ({
    ...item,
    previewUrl: item.previewUrl || crops.get(item.id) || '',
  }));
}
