import '@testing-library/jest-dom';

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
