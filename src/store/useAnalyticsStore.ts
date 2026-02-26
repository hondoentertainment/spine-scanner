import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Individual tracked event with timestamp. */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: string;
  /** Optional metadata (e.g. scan method, ISBN). */
  meta?: Record<string, string | number>;
}

export type AnalyticsEventType =
  | 'scan_barcode_success'
  | 'scan_ocr_success'
  | 'scan_failure'
  | 'book_added'
  | 'book_removed'
  | 'import_performed'
  | 'export_performed'
  | 'sync_performed';

/** Aggregated summary stats derived from events. */
export interface AnalyticsSummary {
  totalScans: number;
  barcodeSuccesses: number;
  ocrSuccesses: number;
  scanFailures: number;
  successRate: number;
  barcodeVsOcrRatio: string;
  booksAdded: number;
  booksRemoved: number;
  imports: number;
  exports: number;
  syncs: number;
}

interface AnalyticsStore {
  events: AnalyticsEvent[];
  /** Record an analytics event. Events are capped at 5000 to limit storage. */
  track: (type: AnalyticsEventType, meta?: Record<string, string | number>) => void;
  /** Get aggregated summary from all events. */
  getSummary: () => AnalyticsSummary;
  /** Clear all analytics data. */
  clearAll: () => void;
}

/** Maximum events to store (FIFO — oldest are dropped). */
const MAX_EVENTS = 5000;

export const useAnalyticsStore = create<AnalyticsStore>()(
  persist(
    (set, get) => ({
      events: [],

      track: (type, meta) =>
        set((state) => {
          const event: AnalyticsEvent = {
            type,
            timestamp: new Date().toISOString(),
            ...(meta ? { meta } : {}),
          };
          const events = [event, ...state.events].slice(0, MAX_EVENTS);
          return { events };
        }),

      getSummary: () => {
        const { events } = get();
        const barcodeSuccesses = events.filter(e => e.type === 'scan_barcode_success').length;
        const ocrSuccesses = events.filter(e => e.type === 'scan_ocr_success').length;
        const scanFailures = events.filter(e => e.type === 'scan_failure').length;
        const totalScans = barcodeSuccesses + ocrSuccesses + scanFailures;
        const totalSuccesses = barcodeSuccesses + ocrSuccesses;

        return {
          totalScans,
          barcodeSuccesses,
          ocrSuccesses,
          scanFailures,
          successRate: totalScans > 0 ? Math.round((totalSuccesses / totalScans) * 100) : 0,
          barcodeVsOcrRatio: totalSuccesses > 0
            ? `${Math.round((barcodeSuccesses / totalSuccesses) * 100)}% barcode / ${Math.round((ocrSuccesses / totalSuccesses) * 100)}% OCR`
            : 'No data',
          booksAdded: events.filter(e => e.type === 'book_added').length,
          booksRemoved: events.filter(e => e.type === 'book_removed').length,
          imports: events.filter(e => e.type === 'import_performed').length,
          exports: events.filter(e => e.type === 'export_performed').length,
          syncs: events.filter(e => e.type === 'sync_performed').length,
        };
      },

      clearAll: () => set({ events: [] }),
    }),
    {
      name: 'spine-scanner-analytics',
    }
  )
);
