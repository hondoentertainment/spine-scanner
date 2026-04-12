## Summary

<!-- Briefly describe what changed and why. -->

## Checklist

- [ ] CI is green (Lint, Test & Build — applies to admins too when *Enforce for administrators* is on)
- [ ] Updated **CHANGELOG.md** `## Unreleased` if the change is user-facing
- [ ] Ran or verified the **E2E MVP workflow** if this PR touches `appMode`, navigation, profile, or library behavior
- [ ] If changing **scan / OCR pipeline** tests, run `npm test` locally (includes `scanRegressionFixtures`) or trigger **OCR integration tests** on Actions
