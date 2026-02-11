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

---

## Remaining (lower priority)

### Accessibility
- Audit icon-only buttons for `aria-label`
- Visible focus indicators beyond browser defaults
- Screen reader testing (VoiceOver / NVDA)

### Optional polish
- Amazon affiliate tag (env config) if desired
- Individual book sharing (copy link / card image)
- Camera torch for low light on mobile

---

## Archived

This doc previously listed many items as "recommended next steps." Those have been implemented. See above for remaining items.
