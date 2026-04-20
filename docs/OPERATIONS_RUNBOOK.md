# SpineScanner Operations Runbook

This runbook covers launch ownership, rollback readiness, support triage, and monitoring after deploy.

## 1) Ownership model

Assign named owners per release:

- **Launch verifier**: runs launch checklist and confirms go/no-go.
- **Rollback owner**: executes rollback if quality gates fail post-deploy.
- **Support owner**: monitors support inbox and triages user reports.

Record names in `LAUNCH_CHECKLIST.md` before the release gate starts.

## 2) Rollback procedure

Use this when release validation fails after deployment.

1. Identify the last known-good commit/tag.
2. Confirm scope of regression (critical vs non-critical).
3. If critical, rollback immediately:
   - Vercel: restore/promote prior production deployment.
   - GitHub Pages manual deploy: redeploy prior good commit.
4. Verify recovery:
   - Home/library/trust pages load
   - Scanner flow operational
   - Sync/login still works
5. Log incident details:
   - Trigger
   - Detection time
   - Resolution and mitigation
   - Follow-up action items

## 3) Support triage workflow

Use this for first-response support handling.

### Initial response checklist

- Ask for browser, device, and app release (shown in footer).
- Ask user to open Support page and copy diagnostics JSON.
- Classify issue:
  - Scanning (barcode/OCR/manual)
  - Metadata lookup
  - Sync/auth
  - Import/export/recovery

### Suggested first-line guidance

- **Scan issues**: improve lighting, stabilize camera, try barcode first, then photo/manual ISBN.
- **Sync issues**: confirm network status, sign-in state, pending queue count, retry sync.
- **Metadata issues**: add manually and edit later; retry lookup on stable network.
- **Recovery issues**: import recent JSON backup, then verify library counts.

### Escalation triggers

Escalate to engineering when:

- Multiple users report same regression within one release window.
- Sync failures exceed baseline and include data-loss risk.
- Scanner crashes or blocked capture path appears reproducible.

## 4) Monitoring and launch-week metrics

Track daily for first 7 days:

- Scan success rate trend (`scan_barcode_success` + `scan_ocr_success` vs `scan_failure`)
- Sync throughput/failure indicators (`sync_performed`, pending queue behavior, Sentry sync errors)
- Support volume by category (scan, sync/auth, metadata, data recovery)

## 5) Dashboards and signals

Minimum required views:

- **Sentry release view** filtered by `app_release` and `app_env`
- **Sentry tags** for `base_path` and app mode
- **App analytics summary** from Profile (local trend checks during QA)

If scan/sync error rates trend upward after release, trigger a release review and consider rollback.
