import type { SpineRegion, RgbaImage } from './types.ts';

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Image load timed out after 10s')), 10000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load image'));
    };
    img.src = src;
  });
}

export function readImagePixels(img: HTMLImageElement): RgbaImage {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (width < 8 || height < 8) throw new Error('Image is too small to scan');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available for shelf detection');
  ctx.drawImage(img, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  return { width, height, data: pixels.data };
}

/** Crop a spine and rotate tall crops so vertical spine text is horizontal for OCR. */
export function cropSpineToDataUrl(img: HTMLImageElement, region: SpineRegion): string {
  const width = Math.max(1, Math.round(region.width));
  const height = Math.max(1, Math.round(region.height));
  const tall = height > width * 1.15;
  const canvas = document.createElement('canvas');
  canvas.width = tall ? height : width;
  canvas.height = tall ? width : height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  if (tall) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, region.x, region.y, width, height, -width / 2, -height / 2, width, height);
  } else {
    ctx.drawImage(img, region.x, region.y, width, height, 0, 0, width, height);
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}
