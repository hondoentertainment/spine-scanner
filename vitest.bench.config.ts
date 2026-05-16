import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated config for the Phase 25 scan benchmark. Keeps the benchmark out of
// the default `npm test` run while reusing the jsdom + setup wiring.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['scripts/benchmark-scan.test.ts'],
    exclude: ['node_modules/**'],
    reporters: ['default'],
  },
})
