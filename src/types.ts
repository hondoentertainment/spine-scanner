export interface BookEntry {
  id: string;
  isbn: string;
  /** True when the book was added by photo only (no ISBN). isbn will be photo-{uuid}. */
  isPhotoOnly?: boolean;
  title: string;
  author: string;
  pageCount: number;
  amazonLink: string;
  coverImg: string;
  status: 'to-read' | 'reading' | 'read' | 'dnf';
  notes: string;
  dateAdded: string;
  shelfIds: string[];
}

export interface Shelf {
  id: string;
  name: string;
  color: string;
}

/** Named OCR scan configuration profile. */
export interface OcrProfile {
  id: string;
  name: string;
  scanMode: 'auto' | 'barcode' | 'ocr';
  ocrLanguage: 'en' | 'de' | 'both';
  /** Built-in profiles cannot be deleted, only switched away from. */
  isBuiltIn?: boolean;
}

/** Factory defaults — always available, never editable by the user. */
export const BUILTIN_OCR_PROFILES: OcrProfile[] = [
  { id: 'standard',    name: 'Standard',      scanMode: 'auto',    ocrLanguage: 'both', isBuiltIn: true },
  { id: 'barcode',     name: 'Barcode Only',  scanMode: 'barcode', ocrLanguage: 'en',   isBuiltIn: true },
  { id: 'ocr-en',      name: 'OCR (English)', scanMode: 'ocr',     ocrLanguage: 'en',   isBuiltIn: true },
  { id: 'multilingual',name: 'Multilingual',  scanMode: 'auto',    ocrLanguage: 'both', isBuiltIn: true },
];

export const SHELF_COLORS = [
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#22c55e', // green
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#ef4444', // red
  '#3b82f6', // blue
] as const;
