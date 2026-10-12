import type { RgbaImage } from '../types.ts';

export type RGB = [number, number, number];

export function solidImage(width: number, height: number, color: RGB): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  fillRect({ width, height, data }, 0, 0, width, height, color);
  return { width, height, data };
}

export function fillRect(
  image: RgbaImage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(image.width, x + w);
  const y1 = Math.min(image.height, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * image.width + xx) * 4;
      image.data[i] = color[0];
      image.data[i + 1] = color[1];
      image.data[i + 2] = color[2];
      image.data[i + 3] = 255;
    }
  }
}

/** One shelf row: colored spines separated by thin white gaps, on a white background. */
export function shelfRowImage(): RgbaImage {
  const image = solidImage(320, 100, [245, 245, 245]);
  fillRect(image, 10, 8, 70, 84, [170, 42, 42]);
  fillRect(image, 86, 8, 70, 84, [36, 72, 168]);
  fillRect(image, 162, 8, 70, 84, [36, 130, 72]);
  return image;
}
