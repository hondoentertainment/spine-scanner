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

