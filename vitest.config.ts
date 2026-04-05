import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/test/**',
        'src/main.tsx',
        // Large shell component; exercised by E2E rather than unit tests.
        'src/App.tsx',
      ],
      // Baseline: stmts/branches/lines from unit suite; function count stays lower because large
      // route/shell components are covered in Playwright rather than Vitest.
      thresholds: { statements: 63, branches: 50, functions: 55, lines: 65 },
    },
  },
})
