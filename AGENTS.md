# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

SpineScanner is a React + TypeScript progressive web app for scanning and managing a personal book library. It supports OCR/barcode scanning, metadata lookup, offline usage, import/export formats, and optional Supabase sync.

## Tech Stack

- React 19
- TypeScript 5
- Vite 7
- Zustand
- Vitest + React Testing Library
- Playwright (E2E)

## Quick Start

```bash
npm install
npm run dev
```

Default local URL: `http://localhost:5173/spine-scanner/`

## Required Validation Before Finishing

Run these for most code changes:

```bash
npm run lint
npm run test
npm run build
```

When touching scanning, OCR, camera, or user flow behavior, also run:

```bash
npm run test:e2e:desktop
```

## Repository Map

- `src/components/` - UI components (scanner, library list/cards, shelf/auth/data panels)
- `src/store/` - Zustand stores (library/auth/analytics state)
- `src/hooks/` - data-fetching and domain hooks (for example, lookup pipeline)
- `src/lib/` - integrations and external services (Supabase/cloud sync)
- `src/utils/` - shared utilities (validation, import/export, links, transforms)
- `src/test/`, `src/testing/` - unit test utilities and test setup
- `e2e/` - Playwright tests and fixtures
- `scripts/` - build/test helper scripts (icons, OCR fixtures, asset copying)

## Change Guidelines

1. Keep diffs focused; avoid unrelated refactors.
2. Preserve current behavior unless the task explicitly requires behavior changes.
3. Prefer small, composable functions and explicit types over implicit `any`.
4. Follow existing naming and file placement patterns in nearby code.
5. Update or add tests when behavior changes.
6. Do not commit secrets. Use `.env` and `.env.example` conventions.

## Notes for Supabase-Related Work

- App should remain functional without Supabase configured.
- If schema or auth behavior changes, update `SUPABASE_AUTH_SETUP.md` and any relevant SQL files under `supabase/` or `docs/`.

## Definition of Done

- Feature/fix implemented
- Relevant tests added/updated
- `lint`, `test`, and `build` pass
- Documentation updated when behavior/setup changes
