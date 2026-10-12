# Portable Regression-Test Foundation

Use Node 24 (local verification: 24.11.1, Windows x64), then `npm ci` and `npm test`.
Other Node major versions are not currently verified. Native canvas/PDF.js dependencies
must install successfully; installation failures are prerequisites failures, not passing tests.

## Commands

- `npm test`: all 66 original entry points plus the external-status regression, separate child processes, 180-second timeout each.
- `npm run test:keeper`: the Keeper subset, with the same isolation and guards.
- `npm run test:external`: report external availability and run explicitly configured checks.
- `npm run test:external -- --require-available`: fail if any external check is unavailable.
- `npm run lint`: existing TypeScript check; not a separate lint engine.

The runner sets its working directory to the repository root, strips live model keys,
does not load dotenv files, and removes external source overrides from portable runs.
Provider/auth regression tests use mocked transports; no live credentials are required.
Each run writes JSON and diagnostic artifacts to a new OS temporary directory and prints
its location. Delete that exact directory when no longer needed. Reports may contain local
evidence; do not upload external reports or manuscripts to Git. `TOOLKIT_TEST_OUTPUT` is
available for direct test execution, but must point outside the repository.

The runner fingerprints repository files before and after execution (excluding dependency,
Git, build, Vercel and preexisting output directories); changed maintained files fail the run.
The explicit manifest rejects unclassified/missing top-level test scripts. Helpers are not
passing entry points. No test should consume another test's generated output.

## Classification and coverage

`tests/test-manifest.json` accounts for every original entry point, test-only helper,
conditional external scenario and inventoried historical investigation. Behavioral versus
source-contract/static coverage is orthogonal to execution prerequisites. Source reads,
transpilation and extracted component functions remain in this phase; passing them does
not establish browser behavior. Existing assertions and scenario loops have been retained.

Portable entry-point PASS means its portable assertions completed. External Stage-1 and
original-manuscript scenarios are explicitly UNAVAILABLE in a portable run and are recorded
separately, never added to its passing coverage. The new synthetic article is additional
coverage, not a replacement for the private original article scenario.

## External checks

- `KEEPER_STAGE1_SOURCE`: authorized Stage-1 HTML; executes the existing parity variants.
- `TOOLKIT_ARTICLE_BASELINE`: authorized original complete article; executes the retained
  full-manuscript citation-protection scenario. The file remains outside Git.
- `VTOOL_JAR`, `TOOLKIT_VALIDATION_XML`, optional `JAVA_BIN`: real Java/VTool invocation,
  with unchanged temporary input, version and complete-report parsing. Errors fail the run;
  warnings/skipped checks remain visible. Associated assets are not copied.
- Independent DTD: UNAVAILABLE until separately configured and reviewed. A VTool result
  is not represented as a second independent validator. Historical PowerShell/Python
  validators remain inventoried, not automatically executed or silently considered passing.

`vtoolBridge.test.mjs` tests bridge/report behavior against local requests and synthetic
reports. It does not invoke VTool. Corpus scans and historical manuscript validators need
explicit local authorization/configuration and are excluded from the portable command.

## Build gaps, unchanged in this phase

Standalone `server.ts` and `api/` entry roots are not included in the existing TypeScript
configuration. Imported modules may still be checked transitively. Vercel uses `vite build`
without a regression/typecheck gate. Electron has separate entry-point, port, module-format
and packaging-dependency inconsistencies. None of these production configurations changed.
No claim is made that a green portable suite establishes production provider availability,
browser worker bundling, full privacy, or publisher DTD/VTool validity.

## Phase 1 corrections

External source overrides resolve against the caller working directory before child dispatch.
External PASS requires a matching source hash, per-run nonce, complete required-case count,
and successful child exit. Missing prerequisites report UNAVAILABLE; malformed or incomplete
completion and execution failures report FAIL. Real VTool validation remains separate.

Historical result annotations remain unchanged. See `testing-phase1/classification-reconciliation.json`
for the 22 corrected classifications and `testing-phase1/privacy-review.json` for report redactions.
Raw evidence is retained privately outside the repository.
