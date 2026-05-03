import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    ...(process.env.CI
      ? {
          testTimeout: 180000,
          maxWorkers: 1,
          minWorkers: 1,
        }
      : {}),
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
      ],
      // Baseline established 2026-02-25: stmts 66.5%, branch 54.1%, funcs 67.0%, lines 68.3%
      thresholds: { statements: 63, branches: 50, functions: 60, lines: 65 },
    },
  },
})
