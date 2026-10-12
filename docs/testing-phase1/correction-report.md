# Phase 1 correction report

Only the three approved corrections were implemented. No production source, schema, route, API contract, deployment configuration or Phase 2 work changed during this correction pass. Nothing staged, committed or pushed.

## Results

- Prior baseline: 66/66 passed. Both correction runs: 66 original tests plus one added regression passed (67/67); zero failures and zero maintained-file changes. No original entry point excluded.
- All 1,599 original assertion call sites preserved as an expression multiset across original tests and shared harnesses; 15 additional call sites. No original assertion expression changed. Static preservation does not establish dynamic assertion counts or browser coverage.
- Original false-PASS mechanism reproduced: relative source existed in caller directory; child reported UNAVAILABLE with exit zero; former exit-only decision was PASS. Corrected dispatch resolved the source, executed it, and reported FAIL/exit 1 for invalid synthetic input. Regression also covers missing prerequisites, malformed/incomplete results, child UNAVAILABLE, mismatched identity/count, nonzero exits and strict availability.
- Authorized external checks: four Stage-1 cases and one original-article case actually completed and PASS. Real VTOOL and independent DTD: UNAVAILABLE. Bridge simulation remains separate.
- Five personal-path strings and two private-identifier strings redacted in commit-bound records. Original raw copies remain outside Git with hashes in privacy-review.json. No manuscript fixtures added.
- Historical baseline/final records equal their raw originals except declared redactions and added privacy metadata. All 22 old classification annotations remain historical; classification-reconciliation.json explains the corrected behavioral/static ownership.
- Unrelated files byte-compared against pre-correction hashes: zero changes. Git index remains empty.

## Files changed in this correction pass

- `tests/external-validation.mjs`
- `tests/external-validation-protocol.mjs`
- `tests/external-validation-status.test.mjs`
- `tests/keeper-evidence.mjs`
- `tests/reference-updater-citation-protection.mjs`
- `tests/run-tests.mjs`
- `tests/test-manifest.json`
- `docs/testing.md`
- `docs/testing-phase1/baseline.json`
- `docs/testing-phase1/final-results.json`
- `docs/testing-phase1/classification-reconciliation.json`
- `docs/testing-phase1/privacy-review.json`
- `docs/testing-phase1/changed-files.json`
- `docs/testing-phase1/correction-results.json`
- `docs/testing-phase1/correction-report.md`

## Exact proposed commit scope

The complete path allowlist is changed-files.json (22 created, 30 modified, 0 deleted). Include only its listed paths and Phase 1 hunks. Existing unrelated changes, including production changes and artifacts, are excluded. Suggested commit: `test: establish portable regressions with verified external statuses`. Await user approval before staging or committing.

## Limitations

Current correction verification used Windows x64 / Node 24.11.1. Other platforms were not run. Earlier clean-install runs remain historical; these correction runs used the current checkout. No live provider/browser/privacy claim is made. Missing publisher validators cannot establish DTD/VTOOL validity. Raw OS-temporary evidence should be retained privately until approval; it is not a durable backup.

Full run accounting and preservation evidence: correction-results.json. Sensitive-pattern scan and synthetic-fixture review are recorded in privacy-review.json; automated scans cannot prove the absence of every possible confidential string.

## Assertion scope reconciliation before local commit

Earlier verification evidence above is preserved and describes the working tree. The working tree preserves all **1,599 baseline assertion call sites**. The approved staged commit preserves all **1,594 applicable baseline assertion call sites**. Five other call sites belong to unrelated, preexisting CRediT changes in `tests/credit-generator-safety.mjs`; they are intentionally excluded and remain untouched and unstaged. They were not removed by Phase 1.

The isolated staged tree passed **67/67 entry points**, with zero maintained-file changes; TypeScript checking passed. This does not imply the five excluded assertions were run in that tree. See `assertion-preservation.json` → `assertionScopeReconciliation` for the exact exclusions and scope. Historical result/count fields are not retroactively rewritten.
