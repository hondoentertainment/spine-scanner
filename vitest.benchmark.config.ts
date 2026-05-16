import { defineConfig } from 'vitest/config';

// Standalone config for the scan benchmark so `npm test` never runs it.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['scripts/benchmark-scan.ts'],
    // Print the benchmark summary straight to stdout instead of buffering it.
    disableConsoleIntercept: true,
  },
});
