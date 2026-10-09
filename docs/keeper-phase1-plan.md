# Keeper Phase 1 — evidence links and coverage

Approved scope: the existing read-only Keeper sandbox. No XML mutation, policy retrieval, new storage service, or change to provider credentials.

Contract: each answer may retain `keeper-answer-evidence-v1` metadata with source IDs/hashes, inspection completeness, per-request retrieval counts, count-tool use, and references to retrieved records. E1/E2 identifiers are assigned by the application from the full inventory, not invented by the model. Model citations may link only to records returned by a successful tool call in that request. Missing citations remain explicitly unlinked; retrieval alone is not semantic verification of a claim.

Coverage separates: (1) local inventory inspection and its limitations, (2) records touched versus fully retrieved for the current answer/batch, (3) evidence links in the answer. Batch progress remains separate from full-file inspection. Neither coverage nor query-response binding establishes implementation of an author correction.

The local evidence viewer resolves references only against matching source IDs/hashes, shows source location and exact bounded text, separates established author response from interpretation, and permits on-demand continuation of long records. It never follows filesystem paths or external links. Answer metadata persists in the existing per-user/task message store; refresh re-inspects retained sources before resolving links.

Acceptance: valid and invalid citations; partial reads and long-record continuations; incomplete/failed/empty inspections; counts without model calls; batch-local versus full-inventory coverage; source mismatch and refresh; escaped XML; API serialization; existing Keeper regressions; TypeScript/build; browser control verification with synthetic data. Model/provider tests must be identified as mocked or live.
