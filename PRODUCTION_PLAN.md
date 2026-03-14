# SpineScanner Production Plan

This plan turns the current app into a production-grade product in phases. The goal is to sequence reliability, trust, and scale work so launch quality improves without stalling product progress.

## Phase 1 - Pre-Launch Hardening

Goal: Make the app safe, credible, and repeatable to deploy publicly.

Success bar:
- One canonical public URL and base path are configured.
- Production env values are validated before deploys.
- Public trust pages, metadata, and crawler files are complete.
- Release checks cover build, unit tests, and critical smoke flows.
- There is a human-readable launch checklist for deploy day.

Deliverables:
- Production config validator in CI/deploy
- Launch checklist and owner-facing runbook
- Real values for `VITE_SITE_URL`, `VITE_BASE_PATH`, `VITE_SUPPORT_EMAIL`
- Sentry DSN and release/environment tagging
- Confirmed legal/privacy copy review
- Smoke test pass on desktop and mobile

Remaining work after this commit:
- Set real production env values in hosting/GitHub
- Run full `npm run lint`, `npm run test:e2e:desktop`, and mobile validation
- Review privacy and terms content with final launch wording
- Define rollback and post-deploy verification ownership

## Phase 2 - First 30 Days After Launch

Goal: Stabilize real usage patterns and reduce operational surprises.

Success bar:
- Failures are observable and triaged quickly.
- Sync, scan, and metadata issues are measurable.
- Support requests have a clear path and repeatable response steps.

Deliverables:
- Release tagging and Sentry dashboards
- Metadata lookup failure analytics
- Sync failure analytics and recovery notes
- Duplicate detection and merge suggestions
- Account deletion and data retention flow
- Support inbox workflow and canned troubleshooting steps

## Phase 3 - Reliability and Scale

Goal: Remove client-only bottlenecks and prepare for heavier usage.

Success bar:
- Metadata and image lookups are no longer dependent on best-effort browser calls.
- Large libraries remain responsive on real devices.
- Multi-device edits and recovery are easier to reason about.

Deliverables:
- Metadata proxy or edge cache for Google Books/Open Library
- Server-side caching and rate limiting
- Large-library profiling with 1k+ books
- Better sync conflict handling
- Backup and restore drills for Supabase
- Release dashboard for deploy health and regression tracking

## Phase 4 - Product Maturity

Goal: Make the app easier to run, support, and grow.

Success bar:
- Operational tasks are routine instead of heroic.
- Launches and incident response are documented.
- The product can add features without destabilizing core flows.

Deliverables:
- Feature flags for unfinished work
- Admin/support diagnostics bundle
- Changelog and release notes process
- Scheduled QA cadence for accessibility, offline, and mobile
- Ownership map for product, ops, and support decisions
