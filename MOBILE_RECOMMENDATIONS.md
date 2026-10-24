# Shipping Spine Scanner on the App Store

This is the follow-on work after the Expo scaffold in `apps/mobile`. The order is what blocks a real App Store release, then what the current web code cannot share as-is.

The scaffold already has: Expo SDK 58 and Expo Router; tabs for Home, Library, Scan, and Profile; `expo-camera` ISBN barcode lookup through the shared Google Books / Open Library path; a Zustand library store persisted with AsyncStorage; Supabase email sign-in; Google sign-in through `expo-auth-session` and PKCE with the `spinescanner://` scheme; session storage that uses SecureStore and falls back to AsyncStorage when the session is larger than SecureStore allows; and an EAS profile set for development, preview, and production.

## P0 — Required before review

1. **Sign in with Apple.** Profile offers Google, so App Store Review Guideline 4.8 requires Sign in with Apple on iOS as well. Add `expo-apple-authentication`, enable the Apple provider in Supabase (Services ID, key, and the same redirect handling as Google), and put the button next to Google. The web auth store cannot be reused for this: `src/store/useAuthStore.ts` starts Google with a browser redirect (`signInWithOAuth` + `redirectBrowser`) and listens to `window` / `document`. The iOS auth store in `packages/shared/src/authStore.ts` only covers email and a `setSession` hook for a native exchange.

2. **Privacy labels, policy, and purpose strings.** The camera string is set (`NSCameraUsageDescription` and the `expo-camera` plugin). App Store Connect still needs a privacy nutrition label (camera, email, user content, identifiers if analytics ship), a privacy policy URL, and an account-deletion path. The web app already has a “Delete all my data” flow in `src/lib` / Profile; the iOS app does not call it. Do not add a microphone string. The camera plugin is configured with `microphonePermission: false` and `recordAudioAndroid: false` so a mic prompt is not invented.

3. **App Store assets.** Replace the Expo template icon in `apps/mobile/assets` with a 1024×1024 icon that has no transparency, and add iPhone screenshots (6.7" and 6.1" at minimum), a description, support URL, and age rating. The current icon is the tabs-template placeholder.

4. **TestFlight.** `eas build --profile production` (or a dedicated TestFlight profile) plus `eas submit --platform ios` once the Apple credentials, ASC app record, and bundle id `com.hondoentertainment.spinescanner` exist. The `preview` profile only does internal distribution. It does not upload to TestFlight.

5. **Supabase redirect allow-list.** Add `spinescanner://auth/callback` and the Expo Go `exp://…/--/auth/callback` URL printed on the Profile tab. Google Cloud’s authorized redirect stays the Supabase callback (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`). Keep Skip nonce check on for Google. The anon key stays in EAS env (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`), never in git.

6. **Account and library behavior under review.** A reviewer will sign in, deny the camera, kill the app, and relaunch. Email sign-in, the camera permission denial state, and the empty library need to be obvious. Cloud refresh merges with this account's device library (`mergePulledLibrary` in `packages/shared`): the device copy wins on the same id, cloud-only books are added, and a book scanned for this account is copied up. Signing out parks that account's cache. The next account does not merge or upload it. Refresh does not delete cloud rows this phone lacks, and it does not run the web conflict list or sync queue.

## P1 — Product parity

7. **Shelf-photo OCR on device.** The web shelf flow is not portable. `src/shelf/imageCanvas.ts` and `src/shelf/runBrowserShelfScan.ts` use canvas and browser image decoding. `src/shelf/decodeSpineBarcode.ts` uses `@zxing/browser`. `src/hooks/useOcrEngine.ts` runs Tesseract.js in a web worker. Those cannot be imported by Metro. What can move later: `src/shelf/parseSpineText.ts` (ISBN extraction from text) and the pure parts of `src/shelf/shelfLookup.ts`. On iOS, capture a still with `expo-camera` (or the photo library, which needs its own purpose string and privacy label) and recognize text with Apple Vision (`VNRecognizeTextRequest`) or ML Kit. Keep the review-before-save step the web app already has. The Scan tab states that shelf photos are not in this build.

8. **Offline storage.** AsyncStorage already persists the Zustand library (`createLibraryStore` in `packages/shared/src/libraryStore.ts`). That is not the web offline stack. Still browser-only:
   - `src/store/useSyncQueue.ts` and the push/retry/conflict path in `src/lib/syncBooks.ts` (the shared package maps rows, merges a pull, fetches, and upserts books and shelves without deleting rows the device does not have)
   - `src/lib/metadataLookupCache.ts` (`localStorage`)
   - the service worker from `vite-plugin-pwa`
   Refresh already uses `mergeBooksLists` instead of last-refresh-wins. A device build still needs a queue that survives airplane mode and replays upserts. SecureStore is only for the auth session, and only when the payload fits.

9. **Push notifications.** The web app reminds you about loans inside Home. Nothing is sent by APNs. Add `expo-notifications`, an APNs key, a device token table in Supabase, and a sender (Edge Function or cron) for due dates. Ask for notification permission in context, and add the matching privacy label. This also needs a physical device; Expo Go’s push story is not the production path.

10. **Deep links.** The scheme `spinescanner://` and `app/auth/callback.tsx` exist so Google can return. Missing: associated domains and an `apple-app-site-association` file for universal links, plus routes for a book (`spinescanner://book/<id>`) and a shared shelf. Auth session return is handled by `WebBrowser.openAuthSessionAsync`; cold-start links are not.

## P2 — Sharing gaps in the current web code

These are why the first share is a package of pure modules plus a store factory, not “import `src/` from the phone.”

| Area | Why the iOS app cannot import it directly |
| --- | --- |
| `src/store/useAuthStore.ts` | `window.location`, `document.visibilitychange`, `pageshow`, e2e seed users, magic link, and password recovery. Google uses a full-page redirect. |
| `src/store/useProfileStore.ts` | Persists with the browser and reads the web Supabase singleton. Reading streaks still update this store from `src/store/useBookStore.ts` (`advanceStreak`). The shared library store takes an `onReadingActivity` callback instead of importing that store. The iOS app does not pass one yet, so streaks do not move. |
| `src/store/useSyncQueue.ts`, `useAnalyticsStore.ts`, `useReadingSessionStore.ts` | `localStorage` persist and web-only call sites. Not moved. |
| `src/lib/bookLookupCore.ts` | Still owns the rate limit, in-memory/localStorage cache, and Sentry breadcrumbs. The fetch itself is `lookupBookByIsbn` in `packages/shared`. |
| `src/lib/errorMonitoring.ts` | `import.meta.env` and `@sentry/react`. Metro will not accept that module. |
| `src/lib/syncBooks.ts` | Stale-row deletion, the sync queue, and `mergeSync` stay on the web. The optional-column retry and the local-wins merge live in `packages/shared`. iOS refresh uses that merge and upserts the result without deleting cloud rows the phone does not have. |
| `src/hooks/useBarcodeScanner.ts`, `src/components/Scanner.tsx` | Webcam, ZXing, and React DOM. The phone uses `expo-camera`. |
| `src/shelf/*` browser files | Canvas, workers, and DOM. See item 7. `parseSpineText` is the piece worth extracting next. |
| `src/recommendations/*` | Fetch logic could move later. The screens are React DOM, and the optional LLM endpoint is a Vite env flag. Home on iOS does not suggest books. |
| `src/utils/amazonLink.ts` | Reads `import.meta.env.VITE_AMAZON_AFFILIATE_TAG`. The phone builds a plain Amazon search URL with no affiliate tag. |
| PWA shell | `src/pwa/updateRegistration.ts`, service worker, install prompt. Not applicable. |
| Tests and coverage | Vitest + jsdom. The phone is typechecked and linted in its own CI job so the web `npm ci` / Playwright job stays the same. `packages/shared` is covered by the existing web tests plus `createAuthStore` / `upsertUserBook` tests. |

`packages/shared` is a `file:` dependency of `apps/mobile`, not an npm workspace. Root `npm ci` does not install Expo. Web files re-export the moved modules from their old paths so call sites and tests did not have to change.

## Suggested sequence

1. Sign in with Apple, privacy policy URL, and account deletion. Refresh already keeps a scan that exists only on the device.
2. App icon, screenshots, TestFlight, and a pass on a physical iPhone (camera, Google, Apple, relaunch).
3. On-device shelf OCR behind the existing review step, reusing `parseSpineText` once it lives in `packages/shared`.
4. Sync queue, push for loan due dates, then universal links.
