import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react v16 + vitest 4 globals don't auto-register cleanup
// reliably. Without explicit cleanup, mounted components from earlier tests
// keep their timers / refs alive, which compounds across files and can keep
// worker processes from idling out.
afterEach(() => {
  cleanup();
});

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
