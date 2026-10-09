# Keeper local-first tasks

Status: revised implementation plan, 2026-10-09. This supersedes the manuscript Storage, cloud extraction and durable cloud review portions of keeper-persistent-task-plan.md and keeper-task-foundation-review.md. No Drive integration. No manuscript uploads to Supabase. This document does not claim the existing application has already been converted.

## Storage boundaries

- Browser IndexedDB: original ZIP bytes, selected XML/ORDER/PDF bytes, immutable revisions, parsed evidence, author responses, detailed findings, conversations and task names/article identifiers. Isolate records by authenticated account UUID and a random local task UUID.
- Supabase: owner UUID, random task UUID, schema version, generic task state, preparation progress, aggregate counts and fixed issue codes/severity. No ZIP, XML, PDF, ORDER, extracted text, title, author names, DOI, filenames, article identifier, free-text findings, chat, evidence quotes or file download links.
- Google Drive: not integrated. No automatic cloud backup of local task content.
- AI providers: no automatic calls during import/preparation. Cloud review is separately enabled for a specific task/request and requires an evidence disclosure preview. Local-only mode is the default for manuscript tasks; preserve provider connections without invoking them implicitly.

Safe summary payloads use a strict allowlist and bounded numeric fields. Validate server-side, reject additional properties and free text; never copy parser diagnostic messages into a summary. Even counts and issue categories reveal some workflow information, so display the sync boundary and offer local-only operation without summary sync. Cloud summary RLS remains owner-only, without application-admin access.

## Task workflow

1. Select one or more ZIP tasks. Files are read locally, not POSTed to an inspection endpoint.
2. Ask for persistent browser storage where supported; explain that persistence may be denied and does not protect against explicit browser-data deletion. Check available space before copying large files and handle quota failures transactionally.
3. Save accepted task/revision bytes and metadata in IndexedDB. Automatically inspect ZIP contents in a Web Worker. Validate traversal, symlinks, encryption, duplicates, actual expanded bytes and corruption. Never execute content, resolve external entities, fetch external DTDs or unpack nested archives.
4. Show XML/ORDER/PDF role checklist and ambiguity/conflict diagnostics locally. Attach missing file creates a revision. Do not silently substitute an author-export XML.
5. Extract XML, ORDER identity and PDF evidence locally with checkpointed workers. Reuse the existing verified matching rules and exact evidence bindings. Browser PDF.js replaces the server native-canvas runtime; extract common pure logic so browser and Node fixtures verify parity.
6. Store complete preparation results atomically. On refresh, recover checkpointed jobs and restore available tasks for the signed-in owner. Stop rendering and terminate active workers on account switch; prevent late writes with owner/task/revision and generation checks.
7. Optionally sync only the strict summary payload. Browser closure pauses local processing; reopening resumes it. Do not promise processing while the browser is closed. Cancellation and deletion remain explicit.
8. User questions about inventory/counts/matched author responses can use deterministic local tools. Keep exact evidence and source locations in the local evidence drawer. No model call is required for those reports.

## Local persistence and devices

IndexedDB survives normal refresh and browser restart but is specific to the origin, browser profile and device. Sign-out hides and releases task data from memory; it does not erase accepted local tasks. Someone with access to that operating-system/browser profile may access local storage: account-scoped keys provide application isolation, not encryption. Evaluate local encryption and its unlock/key-recovery UX before promising confidentiality on shared computers. Do not store a supposedly protective encryption key alongside ciphertext.

Provide Export task backup and Import task backup, containing sources, local history and versioned manifests. State that exports contain unpublished material. Verify backups on import without executing content. Clearing browser data, switching profiles or losing the device can otherwise lose local tasks. Offer Delete local copies as a separate signed-in action with a clear scope.

Another device can show a synced generic summary, labelled Files unavailable on this device. Reattaching files or importing a task backup is required to inspect evidence. Keep a fingerprint locally to detect changed sources; do not sync full manuscript hashes by default. A same-named ZIP is not proof of the same revision.

## Cloud review boundary

Current code is NOT local-only: KeeperSandbox's background inspection POSTs artifacts to /api/ai/chat. chatHandler builds evidence on the server; the tool loop can submit retrieved evidence to Gemini or another configured provider. The server cache is also outside the browser. Absence of Supabase file storage does not remove these disclosures.

Migration must remove automatic artifact POSTs and server cache use from local tasks. Do not send browser XML in chat context, history, logs, telemetry, errors, provider fallback requests or summary fields. UI labels must describe actual data flow.

A future optional cloud review shows provider(s), exact evidence excerpts and user instruction to be sent before dispatch. Approval binds to the request and source revision; selecting another provider/fallback or expanding evidence requires an updated disclosure. Cancel means no transmission. Until enabled explicitly, manuscript tasks use deterministic local outputs. General chat may itself include sensitive pasted text, so distinguish cloud chat from local task inspection visibly; never promise that arbitrary user-written cloud prompts stay local.

Local question answering will initially provide supported deterministic actions rather than pretend to offer full local generative AI. An offline language model is a separate feature and is not included in this plan.

## Implementation order

1. Extract browser-safe inspection core: replace Node crypto with injected/Web Crypto hashing, remove Buffer and native PDF dependencies from browser imports, keep trusted exact-match semantics. Verify synthetic XML/PDF parity against existing regression fixtures.
2. Add IndexedDB repository, versioned task/revision records, owner-scoped access, quota/error handling and local export/import. No cloud Storage bucket or queue migrations.
3. Add ZIP worker and PDF worker with bounded extraction and checkpoint recovery. Keep existing inspection limits until browser benchmarks justify change.
4. Build task list and local evidence/QA workflow. Remove automatic server inspection for these tasks; provide clear supported deterministic review actions.
5. Add minimal optional summary table/API with strict server-side allowlist, RLS, delete/sync semantics and retry idempotency. Summary failure must not lose local tasks.
6. Add separate, explicit cloud evidence review only after the disclosure boundary and provider fallback rules are implemented and tested.

## Acceptance tests

- Network interception proves import, ZIP extraction, PDF preparation, counts, evidence retrieval and deterministic reports transmit no manuscript content or provider requests.
- Summary endpoint rejects filenames, arbitrary messages, excerpts, unknown fields and excessive values. Two-user RLS tests and application-admin tests prove no cross-account summary reads/writes.
- Refresh, browser restart, offline mode, denied persistence, quota exhaustion, interrupted writes, database upgrade, export/import and account switching retain correct local scope.
- Missing/ambiguous sources, hostile ZIPs, external XML entities, corrupt PDFs, source revision changes and expired worker generations cannot silently publish incorrect evidence.
- Sign-out and switching tasks prevent late worker/model responses appearing under another task or account.
- Cloud review cancellation sends nothing; approved payload matches disclosure and revision; no undisclosed fallback or expansion occurs.

This revision changes architecture, not merely storage provider. The previous cloud worker and bucket proposals must not be applied. Existing Keeper remains server-backed until the migration above is implemented and verified.
