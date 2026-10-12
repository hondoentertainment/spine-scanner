import type { MetadataSource } from '../types.ts';

/** A vertical book region inside a shelf photo, in source-image pixels. */
export interface SpineRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0–1 estimate that this band is a distinct spine. */
  confidence: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type ShelfDetectionMethod = 'barcode' | 'ocr' | 'text-search' | 'vision';

export type ShelfReviewDecision = 'accept' | 'reject';

/** One proposed book. Nothing is written to the library until the user accepts it. */
export interface ShelfReviewItem {
  id: string;
  title: string;
  author: string;
  isbn: string;
  pageCount: number;
  coverImg: string;
  /** Crop of the detected spine, used when metadata has no cover. */
  previewUrl: string;
  /** 0–1. */
  confidence: number;
  decision: ShelfReviewDecision;
  metadataSource: MetadataSource;
  detectionMethod: ShelfDetectionMethod;
  needsReview: boolean;
  reviewReason: string;
  rawText: string;
}

export interface ShelfMetadataHit {
  title: string;
  author: string;
  pageCount: number;
  thumbnail: string;
  isbn: string;
  source: MetadataSource;
}

/** Book proposed by an optional external vision endpoint. */
export interface VisionShelfBook {
  title: string;
  author: string;
  isbn: string;
}
