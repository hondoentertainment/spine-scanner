# SpineScanner

A progressive web app for digitizing and managing your personal book library. Scan book spines or barcodes with your webcam, automatically fetch metadata, and organize your collection.

## Features

- **OCR & Barcode Scanning** -- Point your camera at an ISBN barcode or spine text. Uses Tesseract.js for OCR and ZXing for barcode detection, with automatic rotation handling for vertical spines.
- **Automatic Metadata Lookup** -- Fetches title, author, page count, and cover art from Google Books API with Open Library as a fallback.
- **Library Management** -- Search, sort (by title, author, date, pages), and filter by reading status (to-read, reading, read, DNF). Includes reading statistics.
- **Import & Export** -- Full JSON backup/restore, plus Goodreads CSV, LibraryThing TSV, and StoryGraph CSV export formats. Import from CSV, JSON, or by pasting a URL.
- **Offline Support** -- Installable PWA with service worker caching for static assets and API responses.
- **Persistent Storage** -- Library data is saved to localStorage and persists across sessions.
- **Cloud Sync (Optional)** -- Sign in with Supabase to sync your library across devices. Works without an account too.
- **Bookshelves** -- Create custom shelves (Sci-Fi, Lent Out, Work Reading, etc.) and assign books to multiple shelves. Filter your library by shelf.
- **Edit Book Metadata** -- Fix incorrect titles, authors, page counts, and cover images inline.

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

3. Copy your project URL and anon key from **Settings > API** in the Supabase dashboard
4. Create a `.env` file (see `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart the dev server. A "Sign in to sync" button will appear in the header.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test:e2e:mobile` | Run mobile Playwright matrix projects |
| `npm run test:e2e:desktop` | Run desktop Playwright baseline |
| `npm run lint` | Lint with ESLint |

## Deployment

The app auto-deploys to GitHub Pages on push to `main` via GitHub Actions. The workflow installs dependencies, builds, and uploads to Pages.

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
