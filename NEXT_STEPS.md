# Spine Scanner — Next Steps

Status of recommended improvements. Items marked ✅ are implemented.

---

## Completed

| # | Item | Status |
|---|------|--------|
| 1 | TypeScript build errors | ✅ Fixed |
| 2 | Test coverage | ✅ 266 unit tests, Playwright E2E, mobile matrix |
| 3 | ISBN checksum validation | ✅ `isbnValidation.ts` |
| 4 | API resilience & caching | ✅ Retry, cache, debounce, Open Library fallback |
| 5 | Barcode scanning | ✅ ZXing + OCR pipeline |
| 6 | Library sorting & filtering | ✅ Sort, status filter, shelves, stats |
| 7 | JSON export/import | ✅ Full backup/restore |
| 8 | README & docs | ✅ Updated |
| 9 | Offline / PWA support | ✅ vite-plugin-pwa, service worker |
| 10 | Test step in deploy workflow | ✅ `npm run test` before build |
| 11 | Duplicate scan "Update notes" | ✅ Confirm dialog → Open in library |
| 12 | PWA icons (192, 512) | ✅ Generated from SVG |
| 13 | LibraryThing TSV, StoryGraph CSV | ✅ Export formats |
| 14 | Accessibility: aria-labels, focus ring | ✅ Icon buttons, nav, shelf chips |
| 15 | Amazon affiliate tag | ✅ `VITE_AMAZON_AFFILIATE_TAG` in .env |
| 16 | Individual book sharing | ✅ Share button, Web Share API, copy link, deep links `#book-ISBN` |
| 17 | Camera torch | ✅ Flashlight toggle for low light (mobile) |
| 18 | Scanner UX | ✅ Haptics on buttons, faster auto-scan (2s), OCR pre-warm on mount |
| 19 | Version 1.0.0 | ✅ package.json version bumped |
| 20 | Vitest coverage | ✅ @vitest/coverage-v8, `npm run test:coverage`, CI reports coverage |
| 21 | Accessibility: skip link, focus trap, reduced motion | ✅ Skip-to-content link, focus trap in BookDetail modal, `prefers-reduced-motion` support, screen reader view announcements |
| 22 | Grid view virtualization | ✅ @tanstack/react-virtual for grid view (was only list view), handles 1000+ book libraries |
| 23 | Client-side usage analytics | ✅ `useAnalyticsStore` (Zustand + localStorage), tracks scans/books/imports/exports with aggregated summary |
| 24 | Error monitoring (Sentry) | ✅ Optional `@sentry/react` integration, env-gated via `VITE_SENTRY_DSN`, auto-captures ErrorBoundary exceptions |

---

## Remaining (lower priority)

### Accessibility
- Screen reader testing (VoiceOver / NVDA) on real devices

### Optional polish
- Individual book sharing: card image export (future)
- Analytics dashboard UI panel (data is tracked; display panel is future)

---

## Archived

This doc previously listed many items as "recommended next steps." Those have been implemented. See above for remaining items.
