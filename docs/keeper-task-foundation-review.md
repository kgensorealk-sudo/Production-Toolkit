# Keeper tasks: foundation review and implementation contract

> Architecture superseded by [keeper-local-task-plan.md](keeper-local-task-plan.md). Read-only observations remain useful, but the manuscript bucket, cloud extraction and cloud job proposals below must not be implemented.

Date: 2026-10-09. Phase 1 only. Production was inspected read-only; no migration, bucket, queue, deployment or application change was made. This supplements keeper-persistent-task-plan.md.

## Verified deployment facts

- Supabase project Production-Toolkit (`jtrvpqxhjqpifglrhbzu`) is ACTIVE_HEALTHY, PostgreSQL 17, region ap-south-1.
- Live public schema has no Keeper task tables. Existing public tables have RLS enabled, but their policies include administrative access patterns that must not be copied into private manuscript tables.
- The only current Storage bucket is `avatars`, which is public. Its policies are restricted to that bucket. Create a separate private `keeper-tasks` bucket; never store manuscripts in avatars.
- pgmq 1.5.1, pg_cron 1.6.4 and pg_net 0.19.5 are available extensions but none is installed. There is no installed queue/cron infrastructure to rely on yet.
- Vercel project production-toolkit uses Node 24.x. Latest deployment reported READY: dpl_Ax4Amkih5V7ejAG2HBWJs1G68x3n.
- Repository chat function configuration is 60 seconds / 1024 MB with native canvas and PDF.js included. This is repository configuration, not independent confirmation of deployed function settings or account entitlement.
- Account billing tier, effective Storage upload ceiling, database quota, scheduler throughput and worker concurrency were not established by these metadata calls. Do not advertise unlimited storage or assume a proposed limit is supported.

No profile rows, account secrets, manuscript text or signed file links were requested from production.

## Local sample findings

Read local ZIP directory metadata and ORDER structures without extracting attachments or uploading files.

| Measure | Observation |
|---|---|
| ZIP files discovered | 2,385 |
| ZIP files attempted | First 500 in filesystem traversal order; not a random or deduplicated sample |
| Readable / failed directory inspection | 498 / 2 |
| Packages with a matching XML + ORDER + edit-report PDF basename trio | 105 of 498 |
| Compressed ZIP size min / p95 / max | 528 / 14,618,304 / 170,750,489 bytes |
| Expanded size min / p95 / max | 314 / 19,656,648 / 183,426,704 bytes |
| Entry count min / p95 / max | 1 / 25 / 687 |
| ORDER files discovered / sampled | 2,078 / first 100 |
| ORDER formats | All 100 parsed as XML with root `orders` |
| ORDER bytes min / p95 / max | 4,399 / 8,601 / 10,504 |

The trio count is a basename heuristic, not proof of article identity, package validity or processing success. Duplicate package copies and unrelated ZIPs are included. Central-directory totals are untrusted estimates; extraction must also enforce actual byte limits and CRC validation.

The known JAD_122552/S200 package contains five entries and an edit-report PDF, but no exact JAD_122552.xml or ORDER entry. An ORDER exists beside the ZIP. Therefore distinguish an incomplete package from a broken upload. Never silently substitute an author-export XML for the production article XML.

ORDER structure contains `order/item-info`, identifiers such as jid, aid, article-number, pii and doi, dates, stage, figures, e-components, remarks/responses and contact information. Repeated identifier tags also occur elsewhere. Parse identity only at the verified item-info path, never by taking the first matching descendant. Preserve all bytes. Do not interpret ORDER remark/response fields as proof that PDF author queries were answered. Disable external entities/network DTD loading.

## UX adjustment

Keep ZIP task upload as the main action. After preparation, show a file-role checklist: article XML, ORDER, edit-report PDF, each with present/missing/ambiguous/identity-conflict status. Show candidate filenames and reasons when selection is needed.

Provide Attach missing file or Replace package on the selected task. Attaching a file creates a new immutable revision; the old revision and its answers remain historical. Do not silently discover sibling files on the user's computer. Available XML-only questions remain usable with explicit limitations.

Do not enforce exactly five digits in article identifiers. Normalize extension case, allow one enclosing folder and reject ambiguous equally eligible candidates. Identifier disagreements require review; matching filenames alone do not establish identity.

## Database contract

All identifiers are UUIDs except evidence record keys and article display identifiers. All timestamps are timestamptz. Every tenant-owned row carries owner_id referencing auth.users. Use composite unique keys and foreign keys to enforce scope, independently of endpoint checks.

| Table | Required fields and constraints |
|---|---|
| keeper_tasks | id, owner_id, display_identifier, active_revision_id nullable, archived_at, deleting_at, created_at, updated_at; unique(owner_id,id) |
| keeper_task_revisions | id, owner_id, task_id, revision_number, package_sha256, manifest, package_status, diagnostics, created_at; FK(owner_id,task_id) to tasks; unique(owner_id,task_id,id), unique(task_id,revision_number) |
| keeper_artifacts | id, owner_id, task_id, revision_id, role, original_name, object_key, sha256, byte_size, media_type, encoding metadata; composite revision FK; unique(object_key); nonnegative byte_size |
| keeper_inspections | id, owner_id, task_id, revision_id, inspector_version, source_manifest_hash, status, counts, diagnostics, checkpoint, published_at; composite revision FK; unique(revision_id,inspector_version,source_manifest_hash) |
| keeper_evidence_records | id/key, owner_id, task_id, revision_id, inspection_id, artifact_id, kind, location, exact excerpt or private payload reference, binding state; enforce both artifact and inspection belong to same revision; unique(inspection_id,record_key) |
| keeper_review_runs | id, owner_id, task_id, revision_id, inspection_id, request_id, instruction, status, coverage, result, provider metadata, timestamps; composite inspection FK; unique(owner_id,request_id) |
| keeper_messages | id, owner_id, task_id, revision_id, run_id nullable, sequence, role, content, created_at; composite run/task bindings; unique(task_id,sequence) |
| keeper_jobs | id, owner_id, task_id, revision_id, inspection_id/run_id nullable, kind, state, priority, attempts, next_attempt_at, lease_until, fencing_token, checkpoint, idempotency_key; scoped FKs; unique(idempotency_key) |
| keeper_user_settings | owner_id primary key, selected_task_id nullable, preferences; composite owner/task FK |

Active revision FK must include owner_id and task_id so it cannot point at another task. Add it after both tables exist. An inspection also needs a composite unique scope key for run/evidence FKs. Artifact identity and immutable source metadata become fixed when accepted; only explicit lifecycle fields may change later. Allocate revision numbers transactionally, not using client max()+1.

Indexes: tasks(owner_id,updated_at desc,id); revisions(owner_id,task_id,revision_number desc); artifacts(revision_id,role); evidence(inspection_id,kind,record_key); messages(task_id,sequence); runs(owner_id,status,created_at); jobs(state,next_attempt_at,priority,created_at). Index referencing scope columns used in policy and FK checks. Initial one-active-review-per-owner rule needs a partial unique index for queued/running runs and a documented cancellation transition.

RLS: authenticated SELECT only where owner_id = (select auth.uid()); no anonymous grants and no app-admin override. Mutations go through authenticated, ownership-checking endpoints. Do not grant browser INSERT/UPDATE to inspections, evidence, messages, runs or jobs. Endpoint writes derive owner from validated authentication, not request JSON. Service-role worker bypasses RLS, so each job must be loaded and all parent scopes verified before access. Privileged functions use a fixed search_path, narrowly granted EXECUTE, and no default PUBLIC access.

Storage: private bucket, generated owner/task/revision/artifact keys. Signed resumable upload authorization is restricted to one allocated immutable object. No client overwrite/upsert or delete of accepted objects. Downloads require ownership authorization; never rely on path UUID secrecy. Validate actual uploaded bytes and hash before accepting a revision. Avoid logging object links or text.

## API contract

All routes require verified authentication and existing subscription rules. Return structured JSON errors including code, message and requestId; no raw proxy HTML passed to JSON.parse. Resource lookup failures use a consistent not-found response to avoid disclosing another owner's task.

| Route | Contract |
|---|---|
| POST /api/keeper/tasks | clientRequestId, filename, declared size; allocate task/revision/upload destination; declared values are hints only |
| POST /api/keeper/tasks/:id/finalize | revisionId, clientRequestId; verify allocated uploaded object and persist preparation job; repeat returns same accepted operation |
| GET /api/keeper/tasks | cursor, bounded pageSize, filter; stable owner-scoped list |
| GET /api/keeper/tasks/:id | selected revision, file checklist, preparation/run states, diagnostics |
| POST /api/keeper/tasks/:id/revisions | allocate replacement or missing-file revision; explicit candidate role selection is validated server-side |
| POST /api/keeper/tasks/:id/activate | revisionId; ownership + eligible package checks; no reassignment of old runs |
| POST /api/keeper/tasks/:id/prioritize | raise pending preparation priority within per-owner fairness rules |
| POST /api/keeper/tasks/:id/runs | requestId, revisionId, inspectionId, instruction; server loads authorized persisted evidence/history; reject stale/current-source conflicts explicitly |
| GET /api/keeper/tasks/:id/runs/:runId | persisted result, coverage and status; no browser dependence |
| GET /api/keeper/tasks/:id/evidence | inspectionId, bounded cursor or recordKey; exact authorized evidence only |
| POST /api/keeper/tasks/:id/cancel | runId; persist cancellation intent; no promise of refunding work already performed |
| PATCH /api/keeper/tasks/:id | allowlisted display name/archive fields only |
| DELETE /api/keeper/tasks/:id | persist deleting state and cleanup job; status remains until Storage API and database cleanup confirmed |

The application-controlled tool dispatch receives task-scoped artifact/record IDs, not arbitrary paths or URLs. Tool results identify task, revision, inspection and source record. Coverage is computed from persisted retrieval events for this run. Citation validation verifies membership, retrieval and exact quotation; it does not certify interpretation or amendment completion.

## Worker deployment design

Recommended: durable Supabase job rows plus pgmq delivery; pg_cron and pg_net dispatch a protected Node worker endpoint. Queue messages contain only job IDs. Extensions are available but require deployment installation and configuration; they are not currently active.

Keep dispatch separate from the existing chat endpoint. The worker must reuse the known Node 24 PDF runtime and explicitly include its native dependencies. Authenticate dispatcher requests with server-only credentials, reject replays outside a short window, and never permit unauthenticated public job execution. Persist jobs and outbox entries in one database transaction; a dispatcher publishes unsent outbox entries idempotently. This requires a private keeper_job_outbox table in addition to the user-facing tables above. Queue retries must not duplicate accepted runs or outputs.

Each invocation processes a bounded stage/chunk, with a conservative work deadline below its configured function timeout. Persist checkpoints and a new fencing token on each lease claim. Commit outputs only if the token still owns the lease, then acknowledge delivery. Duplicate deliveries, expired leases, cancellation, account deletion and task deletion are checked before writes. Recovery dispatch reclaims expired jobs and retries with backoff; poison jobs remain visible as failed. Browser closure must not stop dispatch.

PDF chunks initially target five pages, decreasing when near deadline; retain the existing 150-page and 1.5M-character inspection ceilings until deliberately tested otherwise. ZIP validation also needs a bounded stage: a ZIP central directory does not make downloading a 170 MB archive safe within the present chat budget. Benchmark range/stream-capable parsing and largest-package extraction before enabling those sizes. If hosting cannot sustain the tested chunk deadlines, use a dedicated Node worker with the same durable contracts rather than extending chat fire-and-forget work.

Provisional capacity settings for benchmarking, NOT configured production promises: 25 MiB compressed ZIP, 64 MiB actual expanded total, 1,000 entries, no recursive archives, 1 MiB ORDER, existing individual XML/PDF parser limits. These accommodate the sampled p95 sizes but exclude observed large packages. Present the configured limits before upload, measure rejected-package demand, and raise them only after account ceilings and worker tests. Aggregate retained storage quota must be chosen from the actual account capacity before launch. Never truncate a package to fit.

## Required implementation gates

1. Review pending Keeper parser/UI fixes separately; preserve unrelated working-tree changes.
2. Confirm account capacities and worker entitlement; create versioned migrations and a rollback/disable plan locally before applying them.
3. Test database and Storage isolation with two ordinary users plus application admin: task IDs, child FKs, uploads, downloads, signed links, jobs and evidence. App admin gets no manuscript browsing privilege.
4. Add safe synthetic fixtures for complete/incomplete/ambiguous packages, malicious paths, symlinks, encryption, CRC failure, size expansion and ORDER identity conflicts. Do not commit manuscript fixtures.
5. Test expired lease fencing, duplicate finalize/delivery, chunk retry, browser closure, multi-tab concurrency, stale revision response, cancellation, partial deletion and account switching.
6. Verify deployed dispatch actually processes accepted jobs without the browser open, and measure largest supported PDF/ZIP cases under deployed limits.
7. Enable task UI only after persistence/security parity; traceable answer rendering follows task isolation. No AI calls during automatic preparation.

Phase 1 result: the design is grounded in live schema and representative local structures. Persistent task functionality is not implemented yet; quota verification and deployed worker benchmarks remain launch gates.
