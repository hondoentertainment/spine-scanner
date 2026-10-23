# SpineScanner

A progressive web app for digitizing and managing your personal book library. Scan book spines or barcodes with your webcam, automatically fetch metadata, and organize your collection.

## Features

- **OCR & Barcode Scanning** -- Point your camera at an ISBN barcode or spine text. Uses Tesseract.js for OCR and ZXing for barcode detection, with automatic rotation handling for vertical spines and a confidence-band signal (low / medium / high) per scan.
- **Shelf photo scan** -- Photograph or upload a whole shelf. On-device detection finds multiple spines, proposes title / author / ISBN candidates (barcode, Tesseract, then Google Books and Open Library), and shows a review list. Accepted books are added to the library; rejected ones are not. The single-spine barcode and OCR modes are unchanged.
- **Automatic Metadata Lookup** -- Fetches title, author, page count, and cover art from Google Books and Open Library in parallel. Source attribution per book and a warning when the two sources disagree on author / page count / title.
- **Library Management** -- Search, sort (by title, author, date, pages), and filter by reading status, shelf, series, page range, physical location (room, case, and shelf label), or books that are lent out. Bulk multi-select for status changes, shelf assignment, location assignment, and deletion. Smart shelves and saved views for repeated filters.
- **Reading Tracking** -- Per-book pages read, started/finished dates, current and longest reading streak, and a "{year} in Books" card with books finished, pages read, average pages/book, and busiest month. A start/stop session timer on reading books logs a per-book session history with aggregate stats.
- **Import & Export** -- Goodreads CSV import (real export format, including ISBN wrappers and shelf mapping), StoryGraph CSV import, plus full JSON backup/restore. Exports: Goodreads CSV, LibraryThing TSV, StoryGraph CSV, Notion CSV, ICS reading calendar, HTML print-friendly.
- **Duplicate Handling** -- Exact-ISBN duplicate merge plus edition-level detection that catches hardcover / paperback / unabridged duplicates of the same book.
- **Offline Support** -- Installable PWA with service worker caching for static assets and API responses.
- **Persistent Storage** -- Library data is saved to localStorage and persists across sessions.
- **Cloud Sync (Optional)** -- Sign in with Supabase to sync your library across devices. A Sync status panel in Profile shows last sync time, pending count, and any failures. Works without an account too.
- **Bookshelves** -- Create custom shelves (Sci-Fi, Lent Out, Work Reading, etc.) and assign books to multiple shelves. Filter your library by shelf.
- **Physical shelf map** -- Record where a copy lives: room, bookcase, and shelf number or label. Edit it on the book card or in book details, assign it to a multi-select, and browse the library by those fields. Show shelves to see the room / case / shelf map.
- **Lending ledger** -- Mark a copy as lent to someone, with an optional due date, and mark it returned. The library can filter to books that are lent out, and overdue copies show a badge. Home reminds you in the app. Nothing is sent by text or email. Older libraries keep their books; the new fields start empty.
- **Shelf recommendations** -- Suggests books you don't own yet, using the authors, subjects, and series already on your shelves (Google Books and Open Library). Each suggestion says why, for example "Because you own Dune and Hyperion". One tap adds it to your to-read list. Results are cached and still show if you are offline or a lookup fails. The library does not wait on them.
- **Edit Book Metadata** -- Fix incorrect titles, authors, page counts, and cover images inline. The **Refresh metadata** action re-queries APIs but never overwrites fields you've manually edited. **Recover missing covers** re-fetches artwork for books without a cover and updates only the cover field.
- **Accessibility & Theming** -- Light, dark, system, and high-contrast (WCAG AAA) themes; full reduced-motion support; skip link, focus traps, and screen-reader announcements throughout.
- **Onboarding & Support** -- A four-step welcome tour for new users, an in-app "What's new" changelog, and a one-click diagnostics bundle download for support requests.
- **Privacy Controls** -- Client-side analytics are opt-in (off by default), and a "Delete all my data" action wipes cloud rows, local storage, and signs you out.

## Tech Stack

- **React 19** + **TypeScript** + **Vite** for the web app
- **Expo SDK 58** + **Expo Router** for the iOS app in `apps/mobile`
- **Tesseract.js** -- OCR engine (web)
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

## iOS app (Expo)

The native app lives in `apps/mobile` and shares types, ISBN checks, metadata lookup, the Supabase client factory, book/shelf data access, and the Zustand library store through `packages/shared` (`@spine/shared`). It does not change the Vite app's install or build.

### Run it in Expo Go

```bash
cd apps/mobile
npm install
cp .env.example .env
npm start
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `apps/mobile/.env` when you want cloud sign-in. Leave them empty to use the app with on-device books only. Do not commit `.env`.

Scan the QR code with the Expo Go app on your phone, or press `i` in the terminal to open the iOS simulator (macOS with Xcode). Expo Go can run the tabs, manual ISBN lookup, and the on-device library. The custom URL scheme is `spinescanner://`.

Google sign-in uses that scheme in a development or store build. The redirect Supabase must allow is exactly `spinescanner://auth/callback` (double slash, not `spinescanner:///auth/callback`). Expo Go cannot claim `spinescanner://`, so `expo-auth-session` falls back to an `exp://` redirect while you are in Expo Go. Add whichever redirect the Profile tab prints to Supabase → Authentication → URL Configuration → Redirect URLs. The Google Cloud client still redirects only to `https://inkbptoncwddalecisyk.supabase.co/auth/v1/callback`. Keep **Skip nonce check** on for the Google provider, the same as the installed PWA.

Camera barcode scanning in Expo Go works when the Expo Go build includes `expo-camera`. If the preview cannot open the camera, use a development build instead of Expo Go.

### Build with EAS

`apps/mobile/eas.json` has three profiles:

| Profile | What it builds |
| --- | --- |
| `development` | Dev client, internal distribution, iOS simulator |
| `preview` | Internal distribution for a device (TestFlight-style sharing comes later) |
| `production` | Store build, with remote version auto-increment |

From `apps/mobile`, after `npm install -g eas-cli` (or `npx eas-cli`) and `eas login`:

```bash
eas build --platform ios --profile development
eas build --platform ios --profile preview
eas build --platform ios --profile production
```

Put `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the EAS environment for the profile you build (`eas env:create`, or the Expo website → Environment variables). EAS inlines `EXPO_PUBLIC_` values at bundle time. Do not put them in `eas.json` or in git.

The iOS bundle id is `com.hondoentertainment.spinescanner`. The display name is Spine Scanner. What still has to happen before the App Store is listed in [MOBILE_RECOMMENDATIONS.md](MOBILE_RECOMMENDATIONS.md).

### Shelf photo scan

Use this when you want to capture a row of books in one photo instead of scanning each barcode.

1. Open **Scan** and choose **Shelf**.
2. Take a photo of the shelf, or upload one. Hold the camera so the spines are upright and the gaps between books are visible.
3. Review the list. Each row can be accepted, rejected, or edited (title, author, ISBN). Nothing is written to your library until you confirm.
4. Choose **Add N books**. Accepted rows with a valid ISBN are looked up and saved. Rows without an ISBN are saved as photo-only books so you can fill them in later. ISBNs already in the library are skipped.

Detection runs on the device (color changes between spines, then the existing Tesseract and ZXing pipelines). Metadata lookup needs a network connection. If you are offline, the review list still shows the on-device title and author text.

An optional vision service can fill in spines the on-device pass misses (similar colors, white spines, heavy perspective). It is off unless both variables are set at build time:

```
VITE_SHELF_VISION_API=true
VITE_SHELF_VISION_ENDPOINT=https://your-vision-endpoint.example/shelf
```

The app POSTs `{ "image": "<data-url>" }` and expects `{ "books": [{ "title": "", "author": "", "isbn": "" }] }`. If the flag is unset or the request fails, the free on-device result is used. Single-book barcode and OCR scanning never calls this endpoint.

A Gemini or Firebase vision model is a good fit for that endpoint later. The app does not bundle a paid vision API.

### Shelf recommendations

Open **Home** and choose **See suggestions**, or go to `/recommendations`.

Each card is a book that is not already in your library. The same ISBN (ISBN-10 or ISBN-13) and other editions of a title you own are left out. The reason names the shelf titles that prompted it, for example `Because you own Dune and Hyperion`. **Add to wishlist** saves that book as To Read.

Suggestions use Google Books and Open Library (authors, subjects, and series from your shelves). They load only after you open the suggestions view, so a slow lookup does not block the library. Results are cached on this device. Offline, or if those services fail, saved suggestions still show.

An optional endpoint can replace that free lookup. It is off unless both variables are set at build time:

```
VITE_RECOMMENDATIONS_LLM=true
VITE_RECOMMENDATIONS_LLM_ENDPOINT=https://your-suggestions-endpoint.example/recommendations
```

The app POSTs `{ "owned": [{ "title": "", "author": "", "subjects": [], "series": "" }], "limit": 12 }` and expects `{ "recommendations": [{ "title": "", "author": "", "isbn": "", "reason": "Because you own ..." }] }`. A reason is kept only when it starts with `Because you own` and the titles it names are on the shelf. If the flag is unset, the endpoint is not https (localhost http is allowed), or the request fails, the free path is used. The app does not bundle a paid model.

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

6. If `books` already exists, run the SQL files in `supabase/migrations/` that your project does not have yet. Physical locations need [`supabase/migrations/007_books_physical_location.sql`](supabase/migrations/007_books_physical_location.sql):

```sql
alter table books
  add column if not exists location_room text not null default '',
  add column if not exists location_case text not null default '',
  add column if not exists location_shelf text not null default '';
```

Empty string means that part of the location is unset. Sync still uploads the rest of each book when these columns are missing; the location stays on this device until the migration is applied.

7. Restart the dev server. When both Supabase variables are set, Profile and the header show **Continue with Google**. Email sign-in stays available as "Use email instead". If either variable is missing, the app stays local-only and explains that cloud sign-in isn't set up.

## Google sign-in

Google sign-in goes through Supabase Auth (`signInWithOAuth` provider `google`, PKCE, same-window redirect back to the app). The Google client secret never goes in this repo or in Vite env. The browser only needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The production Vercel project `spine-scanner` does not have those two variables yet (nothing is hidden in production env either). Until they are set for Production and Preview, https://spine-scanner.vercel.app stays local-only. GitHub Pages builds do not receive Vercel project env, so Pages stays local-only unless the same two variables are added to the Actions build.

Full click-path, including the iOS "Skip nonce check" toggle: [SUPABASE_AUTH_SETUP.md](SUPABASE_AUTH_SETUP.md).

### Google Cloud OAuth client

Project ref: `inkbptoncwddalecisyk`.

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create credentials → OAuth client ID.
2. Application type: **Web application**.
3. Authorized JavaScript origins (Google does not allow wildcards). Required:
   - `https://spine-scanner.vercel.app`
4. Also add each origin you will sign in from. Google rejects a wildcard, so copy the preview host from that deployment when you need it:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `https://spine-scanner-git-<branch>-<team>.vercel.app`
5. Authorized redirect URI — this is the Supabase callback, not the app URL:
   - `https://inkbptoncwddalecisyk.supabase.co/auth/v1/callback`
6. Copy the client ID and client secret into Supabase only. Do not commit them.

### Supabase

1. Authentication → Providers → Google → enable, then paste the client ID and client secret.
2. Turn on **Skip nonce check**. Installed iOS PWAs otherwise fail the Google nonce check after the redirect.
3. Until that provider is enabled, Continue with Google stays on screen and shows: "Google sign-in isn't available for this app yet. You can still sign in with email." The same message is shown when Supabase returns `error` / `error_description` (including `Unsupported provider: provider is not enabled`) in the query string or the hash. The app then removes those params so the page is not left on a broken URL.
4. Authentication → URL Configuration:
   - Site URL: `https://spine-scanner.vercel.app`
   - Redirect URLs:
     - `https://spine-scanner.vercel.app/**`
     - `https://*.vercel.app/**`
     - `http://localhost:5173/**`
5. The app sets `redirectTo` from `window.location.origin` plus the current path (and the Vite base, when there is one). Production, a Vercel preview, and `http://localhost:5173` each return to themselves. After the code exchange, `?code` and `#access_token` are removed and the user is sent back to the page they started on.
6. For the iOS app, also allow `spinescanner://auth/callback`.

Email sign-in can use a magic link ("Check your email") or the existing email and password form. Signing out clears the Supabase session on this device. Books already saved on the device stay here.

### Vercel env

Project **spine-scanner** (`prj_OFj2k0ujYeJxumlVP8JUJbte4yaj`), Production and Preview:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://inkbptoncwddalecisyk.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The anon public key from Supabase → Project Settings → API. Do not commit it. |

Do not set `VITE_E2E_HOOKS`. Redeploy after saving. The anon key is public by design; the Google client secret stays in Supabase.

**Auth flow:** Continue with Google is the primary sign-in. Email and password remain as a fallback. On the first sign-in that finds books already on the device, the app asks before merging. Merge keeps every local book and every cloud book (the device copy wins when the same id exists). Not now leaves the library on the device. Signing out, or running without Supabase env, does not delete local books.

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

**Silent-skip behavior**: The `deploy-vercel` job's Vercel steps are individually guarded with `if: env.VERCEL_TOKEN != ''`. If any of the three Vercel secrets are missing, those steps skip and the workflow still reports success — Pages still deploys. To make that state visible instead of silent, the job runs a `Verify Vercel deploy secrets` step first that emits a `::warning::` in the Actions UI when secrets are missing. If you also set the optional `DEPLOY_ALERT_WEBHOOK` secret (Slack- or Discord-compatible incoming webhook), a `notify-deploy-failure` job posts to it whenever `deploy-pages` or `deploy-vercel` actually fails on `main`.

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
apps/mobile/      Expo Router iOS app (Home, Library, Scan, Profile)
packages/shared/  Types, ISBN lookup, Supabase client, book data access, Zustand stores
src/
  components/     Scanner, BookCard, LibraryList, DataManagement, AuthPanel, ShelfManager
  hooks/          useBookLookup (API with caching, retry, fallback)
  lib/            Supabase client, cloud sync logic
  store/          useBookStore (Zustand), useAuthStore (auth session)
  utils/          ISBN validation, import/export logic, Amazon links
  types.ts        Re-exports the shared BookEntry types
```

## License

MIT
