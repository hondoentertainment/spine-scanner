# Mobile Test Matrix

This matrix defines the minimum mobile validation required before release.
It combines automated Playwright coverage with manual real-device checks for camera/OCR behavior.

## Scope

- OCR scanner startup and capture flow
- Barcode-first detection and OCR fallback behavior
- Manual ISBN fallback UX
- Library/data navigation on touch devices
- Network resilience during OCR engine warmup

## Device Matrix

| Tier | Device | Browser | Required | Notes |
|---|---|---|---|---|
| Emulated | Pixel 7 | Chrome (Playwright) | Yes | `mobile-chrome-pixel-7` |
| Emulated | iPhone 14 | Safari/WebKit emulation (Playwright profile) | Yes | `mobile-safari-iphone-14` |
| Emulated | Galaxy S9+ | Chrome (Playwright) | Yes | `mobile-chrome-galaxy-s9` |
| Real device | iPhone (iOS 17+) | Safari | Yes (pre-release) | Camera permissions + PWA behavior |
| Real device | Android (Pixel/Samsung) | Chrome | Yes (pre-release) | Camera + worker + OCR startup |

## Automated Matrix Commands

- Full e2e: `npm run test:e2e`
- Mobile projects only: `npm run test:e2e:mobile`
- Desktop baseline: `npm run test:e2e:desktop`

## Test Cases and Pass Criteria

| ID | Category | Test Case | Pass Criteria |
|---|---|---|---|
| M01 | Boot | App loads scanner view on first render | Scanner view visible, no console errors |
| M02 | Navigation | Switch Scanner/Library/Data with touch | Each page renders expected heading |
| M03 | Scanner UX | Manual ISBN entry opens and accepts input | Textbox visible and editable |
| M04 | OCR Init | OCR pre-warm does not block UI | Buttons remain responsive, status updates |
| M05 | Barcode Path | Valid ISBN barcode recognized first | ISBN callback triggered for valid 978/979 |
| M06 | OCR Path | OCR returns ISBN when barcode absent | ISBN callback triggered from OCR candidate |
| M07 | OCR Fallback | Worker failure falls back to one-shot recognize | Scan still completes with fallback path |
| M08 | No-Match UX | No ISBN found shows suggestions/manual path | Manual entry or suggestions shown |
| M09 | Permissions | Camera denied path is handled | Error message shown, capture disabled |
| M10 | Resilience | Slow/unstable network during pre-warm | User sees recoverable state, no hard crash |

## Manual Real-Device Checklist

Run these on at least one iPhone Safari and one Android Chrome device:

1. Fresh load with cleared site data.
2. Grant camera permission and verify live preview.
3. Scan a clear ISBN-13 barcode (expected immediate recognition).
4. Scan a spine text sample where barcode is not visible (expected OCR path).
5. Disable network and retry scan (expected recoverable error state, no freeze).
6. Re-enable network and confirm scanner can recover without reinstall.
7. Deny camera permission and verify disabled capture + clear user guidance.
8. Install/open as PWA and repeat steps 3-4.

## Release Gate

A release is mobile-ready when:

- `npm run test:e2e:mobile` passes in CI/local.
- Manual real-device checklist passes on iPhone Safari and Android Chrome.
- No blocking regressions in scanner startup, ISBN recognition, or manual fallback.

## Run Log Template

Copy for each release:

```txt
Release:
Date:
Tester:

Automated:
- test:e2e:mobile: PASS/FAIL
- test:e2e:desktop: PASS/FAIL

Real Device:
- iPhone model + iOS + Safari: PASS/FAIL
- Android model + OS + Chrome: PASS/FAIL

Notes:
- OCR startup:
- Barcode detection:
- OCR fallback:
- Manual ISBN fallback:
- Known issues:
```

## Expo app (`apps/mobile`)

These checks are for the Expo Router app, separate from the browser matrix above. Run them in Expo Go where noted, and on a development build for the magic-link return. `spinescanner://auth/callback` is the redirect. Do not change the Supabase dashboard for this pass. Multi-book shelf recognition is out of scope.

| ID | Where | Test case | Pass criteria |
|---|---|---|---|
| E01 | Profile | Empty or invalid email, then Email me a sign-in link | No request is sent. The screen asks for a valid email. The button is not stuck busy. |
| E02 | Profile | Valid email | The button reads Sending link…, ignores a second tap, then Check your email names that address. |
| E03 | Profile | Open the link on a development build | The app returns through `spinescanner://auth/callback` and Profile shows the account. A provider or network failure shows a short message. Expo Go cannot claim this scheme. |
| E04 | Scan | Take photo or Choose photo, leave the title blank, add the book | Library shows Unknown Title with a Needs review marker. The book is photo-only. |
| E05 | Scan | Add a photo book with a title | Library shows that title and Needs review. |
| E06 | Book | Lend with a borrower and a due date, then Mark returned | The row shows Lent out (or a due label) while it is out, then clears after return. |
| E07 | Book | Set room, case, and shelf | The library row shows the place, for example Study · Oak · Shelf 2. |
| E08 | Library | Sign in, edit a loan or place, Refresh from cloud | The same fields are still on the book after refresh. A failed cloud save says so and keeps the device copy. |

