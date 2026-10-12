# Phase 1 implementation report — 2026-10-12

Scope: Portable Regression-Test Foundation only. No Phase 2/source reorganization.
No production logic, components, schemas, routes, API contracts, provider configuration,
deployment configuration or dependency versions were changed. Preexisting working-tree
changes were retained. Changes are not committed; no new commit SHA exists.

## Recorded results

| Run | Entry points | Failures | Maintained-file changes |
|---|---:|---:|---:|
| Pre-edit baseline, isolated working-tree snapshot | 66 passed | 0 | Original tests wrote only in the snapshot |
| Initial infrastructure run | 65 passed | 1 | 1 agent-written audit report during execution |
| Corrected working-tree run | 66 passed | 0 | 0 |
| Clean source snapshot + fresh npm ci, first run | 66 passed | 0 | 0 |
| Same clean snapshot, repeated run | 66 passed | 0 | 0 |

The initial failure was introduced by the test adapter's use of port 0: bridge Host
validation returned 403 instead of the original expected 401. Selecting an available
actual port fixed the adapter. The assertion was not changed. The initial file-change
guard detected an audit report written by the agent while tests were running; final
runs occurred without concurrent edits and detected zero changes.

`npm run lint` passed. Fresh `npm ci --no-audit --no-fund` installed 753 packages.
Existing dependency deprecation warnings were recorded by npm; dependencies were not upgraded.
Clean snapshot means current working-tree source copied without Git metadata, generated
audit artifacts, output, dotenv files or node_modules, followed by fresh installation.
It is not a claim that these uncommitted changes are a deployed/committed release.

## Assertion and scenario preservation

The pre-edit inventory records SHA-256, assertion/scenario lines, dependency references
and execution output for every original entry point. Static TypeScript-AST comparison
found all 1,599 original `assert.*` call sites, including the Reference Updater harness,
still present. Zero were removed or replaced. Loops/variants and existing assertions
were retained; relocation to a test-only harness removed imported test-execution side
effects, not assertions. Call-site counts are not dynamic assertion counts or browser
coverage measurements.

Two reviewed synthetic JSON fixtures exactly preserve the original `name`, `original`
and `updated` input projections. Generated result fields are not runtime test inputs.
The provider baseline fixture matches the initial HEAD declaration block; its equality
assertion remains. The private 138 KB full article was not copied into Git. Its original
scenario remains external and passed when explicitly configured. The additional synthetic
article is not asserted equivalent to that manuscript.

## External and excluded coverage

- Stage-1 parity: PASS with the explicitly configured local source; UNAVAILABLE without it.
- Original full-article scenario: PASS with the explicitly configured authorized source;
  UNAVAILABLE without it.
- Real VTool: UNAVAILABLE, no configured validator/article pair was run in this phase.
- Independent DTD: UNAVAILABLE, no independent portable adapter configured.
- Strict external mode correctly exits 1 when prerequisites are unavailable.
- Bridge tests exercise local HTTP security/report parsing, not real VTool validation.
- Historical validators/corpus scans are inventoried and explicitly excluded from portable
  execution. None is silently considered passed. The full manifest records their locations.

No original scenario was silently deleted or marked passing through omission. Conditional
external checks are separately recorded and excluded from portable PASS coverage. Existing
source-contract/static tests remain distinguishable from behavioral tests.

## Runner and output verification

An isolated guard harness confirmed nonzero exit for an unclassified test file and for a
test modifying a maintained file. Tests run in separate child processes with explicit
timeouts; reports go outside the repository. Every original entry point and helper is
accounted for. Source-extraction fragility remains documented; no engine extraction was
attempted in this phase.

## Limitations and deferred risks

- Verified on Windows x64 / Node 24.11.1 only. Other platforms/runtime majors remain unverified.
- Native PDF inspection was exercised with synthetic PDF input, not every production PDF.
- Source-contract assertions/extracted functions do not establish complete browser behavior.
- Real VTool adapter invocation remains unverified against an installed validator. Skipped
  checks prevent full PASS; independent DTD configuration remains unresolved.
- Port selection has the normal small reservation-to-bind race; collisions fail rather than
  weakening security assertions.
- Standalone server/API typecheck roots, Vercel's missing test/typecheck gate and Electron
  configuration gaps are documented, unchanged and deferred for separate approval.
- No new live-browser privacy/network audit or production-provider check was performed.
  Documentation does not claim complete local-only manuscript handling. Cloud review uses
  extracted evidence; local source storage is a different boundary.
- No commit/push/deployment was performed. Phase 2 has not begun.

## Evidence and file inventory

- [Baseline inventory/results](baseline.json)
- [Final and interim execution results](final-results.json)
- [Assertion/fixture/production preservation](assertion-preservation.json)
- [Runner guard results](runner-guards.json)
- [Exact files created/modified relative to the pre-edit snapshot](changed-files.json)
- [Test manifest](../../tests/test-manifest.json)
- [Testing instructions](../testing.md)
- [Current Keeper architecture and historical-plan boundaries](../keeper-current-architecture.md)

## Assertion scope reconciliation before local commit

Earlier verification evidence above is preserved and describes the working tree. The working tree preserves all **1,599 baseline assertion call sites**. The approved staged commit preserves all **1,594 applicable baseline assertion call sites**. Five other call sites belong to unrelated, preexisting CRediT changes in `tests/credit-generator-safety.mjs`; they are intentionally excluded and remain untouched and unstaged. They were not removed by Phase 1.

The isolated staged tree passed **67/67 entry points**, with zero maintained-file changes; TypeScript checking passed. This does not imply the five excluded assertions were run in that tree. See `assertion-preservation.json` → `assertionScopeReconciliation` for the exact exclusions and scope. Historical result/count fields are not retroactively rewritten.
