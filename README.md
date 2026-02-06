# SpineScanner

A progressive web app for digitizing and managing your personal book library. Scan book spines or barcodes with your webcam, automatically fetch metadata, and organize your collection.

## Features

- **OCR & Barcode Scanning** -- Point your camera at an ISBN barcode or spine text. Uses Tesseract.js for OCR and ZXing for barcode detection, with automatic rotation handling for vertical spines.
- **Automatic Metadata Lookup** -- Fetches title, author, page count, and cover art from Google Books API with Open Library as a fallback.
- **Library Management** -- Search, sort (by title, author, date, pages), and filter by reading status (to-read, reading, read, DNF). Includes reading statistics.
- **Import & Export** -- Full JSON backup/restore, plus Goodreads CSV, LibraryThing TSV, and StoryGraph CSV export formats. Import from CSV, JSON, or by pasting a URL.
- **Offline Support** -- Installable PWA with service worker caching for static assets and API responses.
- **Persistent Storage** -- Library data is saved to localStorage and persists across sessions.

## Tech Stack

- **React 19** + **TypeScript 5.9** + **Vite 7**
- **Tesseract.js** -- OCR engine
- **@zxing/browser** -- Barcode detection
- **Zustand** -- State management with localStorage persistence
- **Lucide React** -- Icons
- **vite-plugin-pwa** -- Service worker & PWA manifest
- **Vitest** + **React Testing Library** -- Testing

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173/spine-scanner/](http://localhost:5173/spine-scanner/) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with ESLint |

## Deployment

The app auto-deploys to GitHub Pages on push to `main` via GitHub Actions. The workflow installs dependencies, builds, and uploads to Pages.

## Project Structure

```
src/
  components/     Scanner, BookCard, LibraryList, DataManagement
  hooks/          useBookLookup (API with caching, retry, fallback)
  store/          useBookStore (Zustand)
  utils/          ISBN validation, import/export logic, Amazon links
  types.ts        BookEntry interface
```

## License

MIT
