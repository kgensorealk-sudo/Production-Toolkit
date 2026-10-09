# Local Keeper bug review

2026-10-09. Review only; application code was not changed by this review. Synthetic reproduction checks were added in tests/keeper-local-review-repros.mjs. Those checks characterize current bugs, not fixes.

Update: all seven findings below were subsequently addressed in the local working tree. See keeper-local-bug-fixes.md. The former reproduction checks now assert the corrected behavior; the findings below retain the original review context.

## Findings

1. **P1 — ZIP retry changes source identity and hides previous conversation.** keeperLocalZip.ts:45 allocates new artifact UUIDs on every extraction. KeeperLocalTasks.tsx:35 overwrites the task with those new artifacts even for unchanged ZIP bytes. Since conversation selection requires an exact artifact-ID scope, earlier results disappear from the selected task after retry. Reproduced by extracting identical ZIP bytes twice and observing zero prior messages in the second scope. Preserve stable artifact IDs for unchanged source bytes; create an explicit immutable revision for changed bytes, with historical results still accessible.

2. **P1 — Switching tasks destroys task draft instructions.** KeeperSandbox.tsx:706 clears inputPrompt and taskInstructions whenever Open task runs. The only saved workspace is keyed by account, not task, and the subsequent autosave overwrites that single snapshot. Enter instructions for A, open B, then reopen A: the instructions are blank. Save/restore workspace drafts and selected task ID per task/revision before switching. This is confirmed from the state/persistence path; not a signed-in browser reproduction in this review.

3. **P1 — Two tabs can overwrite each other's conversations and source selection.** keeperLocalStore.ts:35 writes the complete owner workspace using an unconditional put, with no revision check, merge, cross-tab notification or single-writer lock. Two tabs restored from the same snapshot can each save unrelated updates; whichever writes last replaces the other's messages, draft and artifacts. Task originals are in another store and are not erased by this specific bug. Use task-scoped records plus version-aware updates/append-only messages and an explicit tab conflict policy. Confirmed from the write contract; concurrent browser execution remains a fix-validation test.

4. **P1 — Cached pasted-XML evidence can be used under a PDF-only source scope.** KeeperSandbox.tsx:438 reuses localEvidence whenever it exists without comparing its source manifest with requestArtifacts. Import PDF, paste XML A and run: cached evidence includes A+PDF. Replace the input with a normal question and run again: requestArtifacts contains only PDF, but the cache still includes A. Results are now saved under the PDF-only scope. Repeating with XML B can mix the histories of different XML inputs into that same PDF scope. Persist pasted XML as an active artifact and require exact source fingerprint/scope agreement before reusing evidence. Confirmed by tracing this branch; no model call is involved.

5. **P2 — Storage restore errors trap the UI behind a loading screen.** KeeperSandbox.tsx:284 sets fileNotice on a failed IndexedDB read but never finishes restoration. The early return at :702 displays only Restoring your local Keeper workspace, hiding the notice and all controls indefinitely. Browser storage disabled, blocked database upgrades and read failures can trigger this. Render explicit restore failure/retry state; never start autosaving blank state over an unread saved workspace.

6. **P2 — Local file imports still enforce an encoded server request limit.** KeeperSandbox.tsx:316 invokes encodeKeeperRequest although the imported files are never sent to that endpoint. A 3,000,000-byte PDF passes the 4 MB file check, but its base64 plus JSON exceeds the 4,000,000-byte server request ceiling and import fails. ZIP extraction uses raw selected-source limits and does not apply this same encoded request check, making the two import routes inconsistent. Reproduced with synthetic bytes. Apply local raw/decoded memory limits independently of the cloud transport encoder.

7. **P2 — One failed pending task prevents later tasks from resuming.** KeeperLocalTasks.tsx:15 catches outside the entire pending-task loop. If the first retained pending ZIP fails extraction or persistence, later pending tasks never get a preparation attempt during that reopening. The failed item stays pending and can block them again on each reopen. Catch/update failure per task, continue eligible tasks, and keep storage-wide failures distinct from a bad package.

## Checks and limits

- Synthetic reproduction checks confirmed findings 1 and 6.
- Existing local privacy-route/XML parity checks and ZIP tests passed. These passing checks did not cover the lifecycle bugs above.
- TypeScript checked separately. No automatic manuscript network transmission was found in the reviewed imported-file inspection/report branches. Static routing checks do not constitute complete authenticated browser network interception.
- This review did not use or upload unpublished manuscript files and did not change production, schema or cloud storage.
- Deferred features already documented (summary sync, full backup/export, ORDER interpretation and full immutable revision UI) are not counted as newly discovered bugs here.

Recommended fix order: stable task/revision/source identity and task-scoped persistence (1–4), visible recovery (5,7), then local capacity consistency (6). Add browser lifecycle tests for task switching, retry, two tabs, failed IndexedDB restoration and cached pasted-source changes before release.
