# Keeper review continuity

Batch progress is recovered from review checkpoints in the selected task's local conversation history, independently of the latest answer. The existing account/task-scoped IndexedDB workspace retains it across refresh and task switching. Clearing the conversation intentionally clears its review progress.

Before contacting Gemini, the application awaits a durable pending checkpoint. After a reply, it saves the completed checkpoint before displaying advancement. A storage failure stops continuation; an interrupted or failed request retains the pending offset for retry. Scope-limit responses cannot advance progress, even if they retrieved the batch records.

Continuation validates source evidence fingerprints, review instructions, cursor boundaries and contiguous completed batch history. Changed sources/instructions, inconsistent history, and older checkpoints without recorded instructions require an explicit fresh review. While local inspection is running, saved progress waits for validation.

The displayed count measures inventory records covered by completed batch interpretations. It does not establish editorial completion or verified author edits. Deterministic inspection limits still apply. Progress and manuscript sources remain in the existing local workspace; this change adds no manuscript upload or remote progress store.

Verification: `tests/keeper-review-continuity.mjs` exercises interrupted requests, refresh persistence, user/task isolation, source/instruction changes, legacy checkpoints, malformed cursors, boundary/history gaps, fresh restarts and final completion. `tests/keeper-review-batches.mjs` checks the authenticated API with mocked provider transport, including a scope-only response that must not advance. Live Gemini availability is separate from these deterministic regression checks.
