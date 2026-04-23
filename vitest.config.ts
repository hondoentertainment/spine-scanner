import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    ...(process.env.CI ? { testTimeout: 180000 } : {}),
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
      // Baseline 2026-02-25: stmts 66.5%, branch 54.1%, funcs 67.0%, lines 68.3%
      // Updated 2026-04-22: raised after targeted branch coverage additions
      thresholds: { statements: 65, branches: 55, functions: 62, lines: 67 },
    },
  },
})
