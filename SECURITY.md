# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in SpineScanner, **please do not open a public GitHub issue**.

Instead, report it privately via one of the following methods:

1. **GitHub private vulnerability reporting** (preferred):
   [https://github.com/hondoentertainment/spine-scanner/security/advisories/new](https://github.com/hondoentertainment/spine-scanner/security/advisories/new)

2. **Email**: security@hondoentertainment.com *(replace with real contact)*

### What to include

- Description of the vulnerability and potential impact
- Steps to reproduce (including URLs, screenshots, or PoC code if applicable)
- Your suggested remediation (optional but appreciated)

### Response timeline

- **Acknowledgement**: within 48 hours
- **Status update**: within 5 business days
- **Fix / disclosure**: coordinated after a patch is available (typically within 30 days)

We ask that you give us reasonable time to investigate and remediate before public disclosure.

## Scope

**In scope:**
- The SpineScanner web application at `https://hondoentertainment.github.io/spine-scanner/`
- Authentication and session handling
- Data storage and cloud sync (Supabase integration)
- Camera / OCR pipeline

**Out of scope:**
- Third-party services (Google Books API, Open Library, Supabase infrastructure)
- Denial-of-service attacks
- Social engineering

## Security Architecture

- **Client-only app**: No server-side code; all processing is in the browser.
- **Supabase Row-Level Security**: Every database row is restricted to `auth.uid() = user_id`.
- **Data stored locally**: `localStorage` for offline-first operation; no PII beyond what the user enters.
- **Sentry (optional)**: ISBNs are stripped from breadcrumbs before transmission.
- **Content Security Policy**: Applied at the CDN layer via `vercel.json`.
