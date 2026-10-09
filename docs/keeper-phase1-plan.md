# Keeper Phase 1 — evidence links and coverage

Approved scope: the existing read-only Keeper sandbox. No XML mutation, policy retrieval, new storage service, or change to provider credentials.

Contract: each answer may retain `keeper-answer-evidence-v1` metadata with source IDs/hashes, inspection completeness, per-request retrieval counts, count-tool use, and references to retrieved records. E1/E2 identifiers are assigned by the application from the full inventory, not invented by the model. Model citations may link only to records returned by a successful tool call in that request. Missing citations remain explicitly unlinked; retrieval alone is not semantic verification of a claim.

Coverage separates: (1) local inventory inspection and its limitations, (2) records touched versus fully retrieved for the current answer/batch, (3) evidence links in the answer. Batch progress remains separate from full-file inspection. Neither coverage nor query-response binding establishes implementation of an author correction.

The local evidence viewer resolves references only against matching source IDs/hashes, shows source location and exact bounded text, separates established author response from interpretation, and permits on-demand continuation of long records. It never follows filesystem paths or external links. Answer metadata persists in the existing per-user/task message store; refresh re-inspects retained sources before resolving links.

Acceptance: valid and invalid citations; partial reads and long-record continuations; incomplete/failed/empty inspections; counts without model calls; batch-local versus full-inventory coverage; source mismatch and refresh; escaped XML; API serialization; existing Keeper regressions; TypeScript/build; browser control verification with synthetic data. Model/provider tests must be identified as mocked or live.

## Verification — October 10, 2026

- Complete existing Keeper regression suite passed in an isolated checkout, together with the new answer-evidence and API tests. API/provider failure cases use mocked auth/provider transport with the real handler and Gemini SDK serialization.
- TypeScript and the isolated production build passed. Existing bundle-size/Browserslist warnings remain; no dependency upgrades were performed. The already-used Markdown parser is now declared directly so citation accounting follows Markdown structure: code, escaped samples, images, and definitions are not counted as clickable links.
- Live production Gemini review of synthetic XML returned one successful evidence-tool call, two fully retrieved edit records and two evidence links. E1 opened the insertion and E2 opened the deletion. Exact XML, source hash, line and character position agreed with the sample. Refresh retained the answer and restored resolvable references after local reinspection.
- The live review took 51.32 seconds overall: Gemini model processing 49.05 seconds, evidence tool under 0.01 seconds. Phase 1 does not change model routing or eliminate provider latency.
- Isolated browser controls verified continuation through characters 5001–6510, partial-retrieval disclosure, unchanged coverage after viewer reads, local-context display, stale-source blocking and recovery after matching hashes were restored.
- Batch tests verified global E11 numbering in the second ten-record batch while keeping the 23-record inventory distinct. Strictly associated author responses retain PDF filename/page provenance; response association is not implementation verification.

Limits: citations validate record provenance and current-request retrieval, not semantic entailment of every sentence. Uncited answers are explicitly disclosed. Source hashes identify the locally inspected version; the server does not independently validate the original manuscript. DTD/VTOOL validation, XML mutation and policy retrieval remain outside Phase 1. No confidential manuscript artifacts are included in this change.
