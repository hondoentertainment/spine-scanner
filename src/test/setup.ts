import '@testing-library/jest-dom';

/** Scanner tests: sync bridge for vi.mock factories (avoid async import deadlock in Vitest workers). */
const SCANNER_BARCODE_KEY = '__SCANNER_TEST_BARCODE__' as const;

type GlobalWithScannerBarcode = typeof globalThis & {
  [SCANNER_BARCODE_KEY]: string | null;
};

const g = globalThis as GlobalWithScannerBarcode;
g[SCANNER_BARCODE_KEY] = null;

export function setScannerTestBarcode(value: string | null): void {
  g[SCANNER_BARCODE_KEY] = value;
}

export function getScannerTestBarcode(): string | null {
  return g[SCANNER_BARCODE_KEY];
}

// Polyfill ResizeObserver for jsdom (used by grid virtualization)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) { this.callback = callback; }
    observe() { /* no-op in tests */ }
    unobserve() { /* no-op in tests */ }
    disconnect() { /* no-op in tests */ }
  };
}
