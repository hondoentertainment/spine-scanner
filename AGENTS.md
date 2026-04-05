# AGENTS.md

## Cursor Cloud specific instructions

SpineScanner is a single-page React PWA (Vite 7, React 19, TypeScript 5.9). There is no backend server; the entire app runs client-side with optional Supabase cloud sync.

### Running the app

- `npm run dev` starts the Vite dev server at `http://localhost:5173/spine-scanner/`
- The base path is `/spine-scanner/`; navigating to `http://localhost:5173/` alone will not load the app.

### Key commands

See `package.json` scripts and `README.md` for the full list. Most common:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Unit tests | `npm run test` |
| Build | `npm run build` |
| E2E tests | `npm run test:e2e` (builds first, uses Playwright on port 4174) |

### Testing caveats

- The OCR-related tests (`scanRegressionFixtures.test.ts`, `useOcrEngine.test.ts`) load Tesseract WASM and can consume significant CPU/memory. In resource-constrained environments, `npm run test` may appear to hang on these tests. Running targeted test subsets (e.g., `npx vitest run src/utils/__tests__/isbnValidation.test.ts`) works fine.
- Integration tests (`npm run test:integration`) require `RUN_OCR_INTEGRATION=1` and network access on first run to download Tesseract language data.
- Playwright E2E tests require a production build first (`npm run build`); the E2E suite serves from `dist/` on port 4174.

### Environment variables

All env vars are optional. The app works fully offline with localStorage. See `.env.example` for the full list. Supabase, Sentry, and site-URL vars are only needed for cloud sync, error monitoring, and production deployment respectively.
