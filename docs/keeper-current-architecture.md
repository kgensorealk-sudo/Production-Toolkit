# Keeper: current architecture and evidence limits

This document describes the inspected working tree, not an independently verified deployed
release. Phase 1 changes test infrastructure/documentation only.

## Implemented paths identified in code

- `KeeperSandbox` and `KeeperLocalTasks` coordinate imported tasks and conversations.
- Account/task-scoped IndexedDB storage is implemented in `keeperLocalStore`.
- ZIP handling and XML/PDF inspection run through local worker adapters and the shared
  deterministic evidence core. A separate Node adapter supplies server hashing/PDF runtime.
- Imported-file review requests send extracted evidence snapshots to the authenticated chat
  handler. Local source storage does not mean all review evidence remains on the PC.
- Deterministic counts/reports are distinct from model interpretation. For evidence review,
  application-controlled allowlisted tool calls, evidence coverage and bounded review batches
  constrain provider answers. Native inspection does not prove author corrections were applied.
- Personal Gemini keys and provider failover remain implemented. Configured models are not
  necessarily available. Offline mascot/editorial-knowledge responses are not current capability.

## What Phase 1 evidence establishes

Synthetic regressions exercise task isolation, IndexedDB lifecycle, cancellation, evidence
scope, counts, query-response association, mocked provider dispatch, API failure handling,
coverage and continuation. A native runtime test extracts a generated PDF using PDF.js/canvas.
Some UI guarantees are checked through source inspection/extracted functions rather than a
browser. Baseline and final results distinguish those forms of evidence.

This phase does not establish complete local-only manuscript handling, browser network
privacy, production-provider reliability, cross-device persistence, or live deployment parity.
Those claims require a separate authenticated runtime/network review. It does not inspect or
change database schemas, RLS, application components, source storage formats or API contracts.

## Historical proposals

`keeper-persistent-task-plan.md` and `keeper-task-foundation-review.md` describe earlier cloud
storage/durable-processing proposals. `keeper-local-task-plan.md` supersedes the manuscript
cloud-storage direction but also contains proposals, including optional summary sync and
richer revision/disclosure workflows. These must not be inferred implemented from planning text.
`keeper-local-implementation-status.md` is dated history, not a current completion checklist.
`keeper-phase1-plan.md` describes earlier evidence-link/coverage work; it is distinct from the
Portable Regression-Test Foundation. Historical live verification is limited to its recorded
date, sources and release; it is not repeated or expanded by this documentation update.
