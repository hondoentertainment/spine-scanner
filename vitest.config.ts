import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    ...(process.env.CI ? { testTimeout: 180000 } : {}),
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'scripts/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/test/**',
        'src/main.tsx',
        // Wraps the virtual:pwa-register module, which only exists in the PWA
        // build — the coverage transform cannot parse it outside that build.
        'src/pwa/**',
      ],
      // Baseline 2026-02-25: stmts 66.5%, branch 54.1%, funcs 67.0%, lines 68.3%
      // Updated 2026-04-22: raised after targeted branch coverage additions
      // Reset 2026-08-04: actuals were stmts 60.1%, branch 49.1%, funcs 49.2%,
      // lines 61.9% — untested UI surface (App.tsx, HomeFeed.tsx) grew faster
      // than tests and the old thresholds silently went red.
      // Updated 2026-08-21 (issue #41): measured stmts 75.6%, branch 65.3%,
      // funcs 71.7%, lines 77.6% after App/HomeFeed/DataManagement/Profile tests.
      // Branch lock is the acceptance floor (65%) with a little headroom on the
      // other metrics so CI does not flake on v8 jitter.
      thresholds: { statements: 72, branches: 65, functions: 68, lines: 74 },
    },
  },
})
