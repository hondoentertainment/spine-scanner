/**
 * Scan benchmark entry point for documentation / tooling parity.
 *
 * The benchmark runs inside Vitest (same jsdom + canvas mocks as scanRegressionFixtures.test.ts).
 *
 * Run from `spine-scanner/`:
 *   npm run benchmark:scan
 *
 * Env:
 *   RUN_SCAN_BENCHMARK     — required by Vitest internally (npm script sets it)
 *   SCAN_BENCHMARK_RUNS   — repeats per fixture (default 10)
 *   SCAN_BENCHMARK_DEVICE — CSV device column label
 *   SCAN_BENCHMARK_OUT    — optional file path for CSV + aggregate footer
 */
export {};
