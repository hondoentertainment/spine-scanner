import { isValidIsbn, normalizeToIsbn13 } from '../utils/isbnValidation.ts';
import { tryFixChecksum } from '../utils/ocr.ts';
import { detectSpineRegions } from './detectSpines.ts';
import { parseSpineText } from './parseSpineText.ts';
import type {
  RgbaImage,
  ShelfDetectionMethod,
  ShelfMetadataHit,
  ShelfReviewItem,
  SpineRegion,
  VisionShelfBook,
} from './types.ts';

const MAX_SPINES = 24;

export interface ShelfScanDeps {
  recognizeText: (region: SpineRegion, index: number) => Promise<{ text: string; confidence?: number }>;
  decodeBarcode?: (region: SpineRegion, index: number) => Promise<string | null>;
  lookupByIsbn?: (isbn: string) => Promise<ShelfMetadataHit | null>;
  lookupByQuery?: (title: string, author: string) => Promise<ShelfMetadataHit | null>;
  visionBooks?: VisionShelfBook[] | null;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function normalizeDetectedIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X');
  if (cleaned.length !== 10 && cleaned.length !== 13) return null;
  if (isValidIsbn(cleaned)) return cleaned;
  return tryFixChecksum(cleaned);
}

const reviewReasonFor = (
  method: ShelfDetectionMethod,
  isbn: string,
  title: string,
  author: string,
): string => {
  if (!isbn) return 'No ISBN detected. Confirm the title and author, or reject this spine.';
  if (title === 'Unknown Title' || author === 'Unknown Author') {
    return 'A likely book was found, but the title or author still needs a look.';
  }
  if (method === 'text-search') return 'Matched by title search. Confirm this is the right edition.';
  if (method === 'vision') return 'Filled in by the optional vision service. Confirm before import.';
  return 'Low-confidence read. Confirm the details before import.';
};

const blankItem = (
  id: string,
  patch: Partial<ShelfReviewItem> & Pick<ShelfReviewItem, 'title' | 'author' | 'detectionMethod'>,
): ShelfReviewItem => {
  const isbn = patch.isbn ?? '';
  const title = patch.title || 'Unknown Title';
  const author = patch.author || 'Unknown Author';
  const recognizable = Boolean(isbn) || title !== 'Unknown Title';
  const needsReview = patch.needsReview ?? (
    !isbn || title === 'Unknown Title' || author === 'Unknown Author'
    || patch.detectionMethod === 'text-search'
    || patch.detectionMethod === 'vision'
    || (patch.confidence ?? 0) < 0.55
  );
  return {
    id,
    title,
    author,
    isbn,
    pageCount: patch.pageCount ?? 0,
    coverImg: patch.coverImg ?? '',
    previewUrl: patch.previewUrl ?? '',
    confidence: patch.confidence ?? 0.45,
    decision: patch.decision ?? (recognizable ? 'accept' : 'reject'),
    metadataSource: patch.metadataSource ?? 'manual',
    detectionMethod: patch.detectionMethod,
    needsReview,
    reviewReason: needsReview
      ? (patch.reviewReason || reviewReasonFor(patch.detectionMethod, isbn, title, author))
      : '',
    rawText: patch.rawText ?? '',
  };
};

const fromVisionBook = (book: VisionShelfBook, index: number): ShelfReviewItem => {
  const isbn = normalizeDetectedIsbn(book.isbn) ?? '';
  return blankItem(`vision-${index + 1}`, {
    title: book.title.trim() || 'Unknown Title',
    author: book.author.trim() || 'Unknown Author',
    isbn,
    confidence: 0.62,
    detectionMethod: 'vision',
    needsReview: true,
    reviewReason: 'Proposed by the optional vision service. Confirm before import.',
  });
};

const applyHit = (
  hit: ShelfMetadataHit,
  fields: { title: string; author: string; isbn: string; pageCount: number; coverImg: string; metadataSource: ShelfReviewItem['metadataSource'] },
) => {
  if (hit.title) fields.title = hit.title;
  if (hit.author) fields.author = hit.author;
  if (hit.pageCount > 0) fields.pageCount = hit.pageCount;
  if (hit.thumbnail) fields.coverImg = hit.thumbnail;
  fields.metadataSource = hit.source;
  const isbn = normalizeDetectedIsbn(hit.isbn);
  if (isbn) fields.isbn = isbn;
};

/**
 * Detect spines, read each one, and build the review list.
 * Lookup and vision are optional; a failed lookup leaves the OCR text in place.
 */
export async function scanShelfPhoto(image: RgbaImage, deps: ShelfScanDeps): Promise<ShelfReviewItem[]> {
  const regions = detectSpineRegions(image).slice(0, MAX_SPINES);
  const vision = deps.visionBooks ?? [];
  if (regions.length === 0) {
    return vision.map(fromVisionBook);
  }

  const items: ShelfReviewItem[] = [];
  for (let index = 0; index < regions.length; index++) {
    if (deps.signal?.aborted) break;
    const region = regions[index];
    deps.onProgress?.(`Reading spine ${index + 1} of ${regions.length}...`);

    let barcode: string | null = null;
    if (deps.decodeBarcode) {
      try {
        barcode = normalizeDetectedIsbn(await deps.decodeBarcode(region, index));
      } catch {
        barcode = null;
      }
    }

    let ocrText: string;
    let ocrConfidence: number | undefined;
    try {
      const recognized = await deps.recognizeText(region, index);
      ocrText = recognized.text ?? '';
      ocrConfidence = recognized.confidence;
    } catch {
      ocrText = '';
    }

    const parsed = parseSpineText(ocrText);
    const visionBook = vision[index];
    const fields = {
      title: parsed.title,
      author: parsed.author,
      isbn: barcode ?? parsed.isbn ?? '',
      pageCount: 0,
      coverImg: '',
      metadataSource: 'manual' as ShelfReviewItem['metadataSource'],
    };

    if (visionBook) {
      if ((fields.title === 'Unknown Title' || !fields.title) && visionBook.title.trim()) {
        fields.title = visionBook.title.trim();
      }
      if ((fields.author === 'Unknown Author' || !fields.author) && visionBook.author.trim()) {
        fields.author = visionBook.author.trim();
      }
      if (!fields.isbn) {
        const visionIsbn = normalizeDetectedIsbn(visionBook.isbn);
        if (visionIsbn) fields.isbn = visionIsbn;
      }
    }

    let detectionMethod: ShelfDetectionMethod = barcode ? 'barcode' : 'ocr';
    if (!barcode && !parsed.isbn && visionBook?.isbn && fields.isbn) detectionMethod = 'vision';
    if (!barcode && parsed.title === 'Unknown Title' && visionBook?.title && fields.title !== 'Unknown Title') {
      detectionMethod = 'vision';
    }

    let confidence = barcode ? Math.max(parsed.confidence, region.confidence, 0.9) : parsed.confidence;
    if (!barcode && typeof ocrConfidence === 'number') {
      confidence = clamp01((confidence + ocrConfidence / 100) / 2);
    }

    if (fields.isbn && deps.lookupByIsbn) {
      try {
        const hit = await deps.lookupByIsbn(fields.isbn);
        if (hit) {
          applyHit(hit, fields);
          confidence = Math.min(0.97, confidence + 0.06);
        }
      } catch {
        /* Keep the on-device read when metadata is unreachable. */
      }
    } else if (fields.title !== 'Unknown Title' && deps.lookupByQuery) {
      try {
        const hit = await deps.lookupByQuery(
          fields.title,
          fields.author === 'Unknown Author' ? '' : fields.author,
        );
        if (hit) {
          const hadIsbn = Boolean(fields.isbn);
          applyHit(hit, fields);
          if (!hadIsbn && fields.isbn) detectionMethod = 'text-search';
          confidence = Math.min(0.9, confidence + 0.05);
        }
      } catch {
        /* Offline title search is optional. */
      }
    }

    items.push(blankItem(region.id, {
      ...fields,
      confidence,
      detectionMethod,
      rawText: ocrText,
    }));
  }

  for (let index = regions.length; index < vision.length; index++) {
    items.push(fromVisionBook(vision[index], index));
  }

  const seen = new Set<string>();
  for (const item of items) {
    const isbn = normalizeDetectedIsbn(item.isbn);
    if (!isbn) continue;
    const key = normalizeToIsbn13(isbn);
    if (seen.has(key)) {
      item.decision = 'reject';
      item.needsReview = true;
      item.reviewReason = 'Same ISBN as another spine in this photo. Accept it only if you want a second copy.';
    } else {
      seen.add(key);
    }
  }

  return items;
}
