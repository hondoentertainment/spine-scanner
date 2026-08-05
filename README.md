# SpineScanner

A progressive web app for digitizing and managing your personal book library. Scan book spines or barcodes with your webcam, automatically fetch metadata, and organize your collection.

## Features

- **OCR & Barcode Scanning** -- Point your camera at an ISBN barcode or spine text. Uses Tesseract.js for OCR and ZXing for barcode detection, with automatic rotation handling for vertical spines and a confidence-band signal (low / medium / high) per scan.
- **Automatic Metadata Lookup** -- Fetches title, author, page count, and cover art from Google Books and Open Library in parallel. Source attribution per book and a warning when the two sources disagree on author / page count / title.
- **Library Management** -- Search, sort (by title, author, date, pages), and filter by reading status, shelf, series, or page range. Bulk multi-select for status changes, shelf assignment, and deletion. Smart shelves and saved views for repeated filters.
- **Reading Tracking** -- Per-book pages read, started/finished dates, current and longest reading streak, and a "{year} in Books" card with books finished, pages read, average pages/book, and busiest month. A start/stop session timer on reading books logs a per-book session history with aggregate stats.
- **Import & Export** -- Goodreads CSV import (real export format, including ISBN wrappers and shelf mapping), StoryGraph CSV import, plus full JSON backup/restore. Exports: Goodreads CSV, LibraryThing TSV, StoryGraph CSV, Notion CSV, ICS reading calendar, HTML print-friendly.
- **Duplicate Handling** -- Exact-ISBN duplicate merge plus edition-level detection that catches hardcover / paperback / unabridged duplicates of the same book.
- **Offline Support** -- Installable PWA with service worker caching for static assets and API responses.
- **Persistent Storage** -- Library data is saved to localStorage and persists across sessions.
- **Cloud Sync (Optional)** -- Sign in with Supabase to sync your library across devices. A Sync status panel in Profile shows last sync time, pending count, and any failures. Works without an account too.
- **Bookshelves** -- Create custom shelves (Sci-Fi, Lent Out, Work Reading, etc.) and assign books to multiple shelves. Filter your library by shelf.
- **Edit Book Metadata** -- Fix incorrect titles, authors, page counts, and cover images inline. The **Refresh metadata** action re-queries APIs but never overwrites fields you've manually edited. **Recover missing covers** re-fetches artwork for books without a cover and updates only the cover field.
- **Accessibility & Theming** -- Light, dark, system, and high-contrast (WCAG AAA) themes; full reduced-motion support; skip link, focus traps, and screen-reader announcements throughout.
- **Onboarding & Support** -- A four-step welcome tour for new users, an in-app "What's new" changelog, and a one-click diagnostics bundle download for support requests.
- **Privacy Controls** -- Client-side analytics are opt-in (off by default), and a "Delete all my data" action wipes cloud rows, local storage, and signs you out.

## Tech Stack

- **React 19** + **TypeScript 5.9** + **Vite 7**
- **Tesseract.js** -- OCR engine
- **@zxing/browser** -- Barcode detection
- **Zustand** -- State management with localStorage persistence
- **Lucide React** -- Icons
- **vite-plugin-pwa** -- Service worker & PWA manifest
- **Supabase** -- Optional cloud auth & database sync
- **Vitest** + **React Testing Library** -- Testing

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173/spine-scanner/](http://localhost:5173/spine-scanner/) in your browser.

### Cloud Sync Setup (Optional)

The app works fully offline with localStorage. To enable cross-device sync:

1. Create a free project at [supabase.com](https://supabase.com)
2. Run this SQL in the Supabase SQL Editor to create the `books` table:

```sql
create table books (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  isbn text not null default '',
  title text not null default '',
  author text not null default '',
  page_count integer not null default 0,
  amazon_link text not null default '',
  cover_img text not null default '',
  status text not null default 'to-read',
  notes text not null default '',
  date_added text not null default '',
  shelf_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table shelves (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default '',
  color text not null default '#6366f1'
);

-- Row Level Security: users can only access their own data
alter table books enable row level security;
alter table shelves enable row level security;

create policy "Users can view their own books"
  on books for select using (auth.uid() = user_id);

create policy "Users can insert their own books"
  on books for insert with check (auth.uid() = user_id);

create policy "Users can update their own books"
  on books for update using (auth.uid() = user_id);

create policy "Users can delete their own books"
  on books for delete using (auth.uid() = user_id);

create policy "Users can view their own shelves"
  on shelves for select using (auth.uid() = user_id);

create policy "Users can insert their own shelves"
  on shelves for insert with check (auth.uid() = user_id);

create policy "Users can update their own shelves"
  on shelves for update using (auth.uid() = user_id);

create policy "Users can delete their own shelves"
  on shelves for delete using (auth.uid() = user_id);
```

3. (Optional) For username support on sign-up, run `supabase/migrations/001_profiles.sql` in the SQL Editor.

4. Copy your project URL and anon key from **Settings > API** in the Supabase dashboard
5. Create a `.env` file (see `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

6. Restart the dev server. A "Sign in to sync" button will appear in the header.

**Auth flow:** Sign-up collects email, password, and optional username. Username is stored in profiles and shown in the UI when available. Sign-in uses email + password only (not username).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run check:production` | Validate production env/base-path/support config |
| `npm run preview` | Preview production build |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:integration` | Run unit tests + Tesseract OCR integration (requires network for first run) |
| `npm run test:all` | Run unit tests then integration tests |
| `npm run generate-ocr-fixture` | Generate `e2e/fixtures/book-spine-isbn.png` for E2E OCR tests |
| `npm run test:e2e` | Generate OCR fixture (if needed) and run Playwright E2E tests |
| `npm run test:e2e:release` | Build and run the release smoke suite on desktop Chromium |
| `npm run test:e2e:ui` | Run Playwright with UI |
| `npm run test:e2e:mobile` | Run mobile Playwright matrix projects |
| `npm run test:e2e:desktop` | Run desktop Playwright baseline |
| `npm run lint` | Lint with ESLint |

### E2E Setup

1. **Build first**: `npm run build` (E2E serves the built app on port 4174)
2. **Port isolation**: Playwright uses port **4174** by default to avoid conflicts with `npm run preview` (4173) or other apps
3. **OCR fixture**: `test:e2e` runs `generate-ocr-fixture` before tests to ensure `e2e/fixtures/book-spine-isbn.png` exists — commit this file for reliable CI

## Deployment

On push to `main`, the `Lint, Test, Build & Deploy` workflow (`.github/workflows/ci.yml`) runs lint, unit tests, the production-readiness check, the production build, Playwright E2E, and **then deploys to BOTH GitHub Pages and Vercel** in parallel jobs gated on the verify job passing.

### Required GitHub configuration

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

- `VERCEL_TOKEN` — generate at [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_ORG_ID` — find in `.vercel/project.json` after running `vercel link` locally, or in the Vercel dashboard
- `VERCEL_PROJECT_ID` — same source as `VERCEL_ORG_ID`
- `VITE_SENTRY_DSN` (optional) — production Sentry DSN

**Variables** (Settings → Secrets and variables → Actions → Variables):

- `VITE_SITE_URL` — public Pages URL (defaults to `https://<owner>.github.io`)
- `VITE_BASE_PATH` — Pages base path (defaults to `/spine-scanner/`)
- `VITE_BASE_PATH_VERCEL` — Vercel base path (defaults to `/`)
- `VITE_SUPPORT_EMAIL` — monitored support address (defaults to `noreply@example.com`)

**Vercel project setup**: After adding the secrets, **disconnect Vercel's GitHub auto-deploy** in the Vercel dashboard (Project → Settings → Git) so deploys flow only through this workflow — otherwise every push triggers two parallel Vercel builds.

### Manual fallback

`.github/workflows/deploy.yml` still exists as a `workflow_dispatch`-only Pages deploy for one-off rebuilds (e.g. redeploy without a code push, or deploy a non-main branch).

### Public Launch Configuration

Before treating the site as public-facing, set these optional env vars so metadata, canonical URLs, and support links are complete:

```bash
VITE_SITE_URL=https://your-public-domain.example
VITE_BASE_PATH=/
VITE_SUPPORT_EMAIL=support@example.com
VITE_ENABLE_SCANNER_DEBUG=false
VITE_APP_ENV=production
```

The app now includes footer-linked About, Privacy, Terms, and Support pages, plus social metadata, a share preview image, generated `robots.txt`, and a generated `sitemap.xml`. If you deploy somewhere other than GitHub Pages, keep one canonical public URL, set `VITE_SITE_URL` to it, and set `VITE_BASE_PATH` to the path segment you actually serve from.

For monitoring, `VITE_APP_RELEASE` can be injected by CI so Sentry events can be grouped by deployed revision.

### Launch Planning

- Phased roadmap: `PRODUCTION_PLAN.md`
- Release checklist: `LAUNCH_CHECKLIST.md`

Run `npm run check:production` before production builds to catch missing or risky public-site configuration.
Run `npm run test:e2e:release` before launch candidates to verify the current release shell, navigation, and support diagnostics path.

## Mobile Validation

See `e2e/MOBILE_TEST_MATRIX.md` for the mobile test matrix, release gate criteria, and run-log template.

## Project Structure

```
src/
  components/     Scanner, BookCard, LibraryList, DataManagement, AuthPanel, ShelfManager
  hooks/          useBookLookup (API with caching, retry, fallback)
  lib/            Supabase client, cloud sync logic
  store/          useBookStore (Zustand), useAuthStore (auth session)
  utils/          ISBN validation, import/export logic, Amazon links
  types.ts        BookEntry interface
```

## License

MIT
