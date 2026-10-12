import { isValidIsbn } from '../utils/isbnValidation.ts';
import { tryFixChecksum } from '../utils/ocr.ts';

/**
 * One-shot ZXing decode of a spine crop. Uses the same ISBN formats as the
 * live barcode scanner. Returns null when the crop has no readable code.
 */
export async function decodeSpineBarcode(imageSrc: string): Promise<string | null> {
  if (!imageSrc) return null;
  try {
    const [browserMod, libraryMod] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    const hints = new Map();
    hints.set(libraryMod.DecodeHintType.POSSIBLE_FORMATS, [
      libraryMod.BarcodeFormat.EAN_13,
      libraryMod.BarcodeFormat.UPC_A,
      libraryMod.BarcodeFormat.CODE_128,
      libraryMod.BarcodeFormat.ITF,
    ]);
    hints.set(libraryMod.DecodeHintType.TRY_HARDER, true);
    const reader = new browserMod.BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 0,
      delayBetweenScanSuccess: 0,
    });
    const result = await reader.decodeFromImageUrl(imageSrc);
    const digits = result.getText().replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X');
    if (isValidIsbn(digits)) return digits;
    return tryFixChecksum(digits);
  } catch {
    return null;
  }
}
