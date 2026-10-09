# Keeper XML/PDF evidence tool

This is an internal read-only tool in the Keeper sandbox. It does not operate other tools or modify manuscripts. The existing Gemini provider chain and subscription checks remain in place.

## Input and execution

Import one UTF-8 XML and, optionally, its edit-report PDF in the Workbench. Pasted XML is also inspected as an artifact. Binary PDFs are transported as base64. The server validates the request, computes SHA-256 fingerprints from the supplied bytes, and builds a request-local inventory. No artifact is written to disk or retained in a shared server cache. Browser file attachments remain in memory until removed, the workspace is cleared, or the page is unloaded.

The initial model request contains file identifiers and inventory metadata rather than the whole article. Keeper requests a function call; the application validates the name and arguments, reads only the artifacts in that request, and returns evidence. The complete model call content is retained for Gemini thought-signature continuity, following the [Gemini function-calling pattern](https://ai.google.dev/gemini-api/docs/function-calling). The OpenAI fallback follows the same dispatch restrictions.

- `inspect_sandbox_evidence`: paged OPT/query records, optionally selected by artifact, record ID, kind or literal text search. Long records support `textOffset` continuation.
- `review_query_responses`: compact batches of up to 40 original queries and strictly matched author responses (48,000-character page budget); unmatched answers remain unassigned. Long records require full retrieval.
- `read_sandbox_xml`: a bounded article excerpt by artifact ID and character offset, optionally locating a literal search string. Arbitrary paths and URLs are not accepted.

The request limit is 4 MB, including JSON/base64 overhead and conversation history. The UI accepts at most one XML and one PDF; the API accepts up to four artifacts, but automatic response binding requires exactly one successfully inspected XML and one PDF. PDF extraction is limited to 150 pages and 1.5 million extracted characters. XML inventory is limited to 10,000 records with an explicit incomplete-inventory diagnostic. Each evidence page contains at most ten records and 24,000 record characters; individual text fields are paged in 5,000-character slices. Article excerpts are limited to 12,000 characters. Calls are bounded to eight tool calls over at most six model rounds sharing the handler's 55-second deadline (including authentication), within a 60-second function duration; evidence-model calls have up to 30 seconds each, checked between PDF pages and before model calls. These bounds are application safeguards, not a promise that every large task will fit one request.

## Evidence contract

Each record includes a stable ID within the supplied artifact, artifact ID, kind, exact source and decoded text. XML locations use zero-based UTF-16 offsets and one-based line numbers; PDF records have a one-based starting page and extracted line number. Surrounding XML is context, not proof of query ownership. Commented production queries are explicitly marked. File summaries contain fingerprints and extraction diagnostics; source binding is computed on inspection and reused from the private cache when available.

OPT type recognition is case-insensitive. Self-closing tags and empty paired tags are errors; nested OPT tags and unknown OPT types are warnings. Whitespace-only INS/DEL is retained as intentional spacing. Diagnostics never prohibit Keeper from continuing a task. Malformed XML is reported as uninspectable rather than repaired or partially represented as a complete inventory. External entities are never fetched.

The QA report shows how many inventory records Keeper retrieved and how many XML excerpts it read; retrieval is not a claim of editorial completion. It also lists unresolved response bindings with reasons. The QA report remains available when an AI response cannot be completed. It lists OPT issue locations and file-extraction failures. Inspection errors are separate from cloud connectivity or review-budget failures.

## Stage 1 response matching

The matcher adapts the existing generator's geometric PDF reading order, QN/Query/Answer block parser, contextual supplementary-data DOI association, and strict response matching. It does not import the generator's multi-stage workflow.

Automatic attachment requires all of:

1. A unique XML article DOI from `article/item-info/ce:doi` and a matching unique contextual article DOI in the PDF. Reference-list DOIs and filenames do not establish identity.
2. A unique individual XML qN and PDF QN identifier. `query` and `ce:query` are supported.
3. No competing or contradictory explicit QID labels.
4. Equal normalized query wording and a nonempty author response.

Otherwise the binding remains unresolved, ambiguous or conflicting with a reason. Raw PDF blocks remain available as unbound evidence. Unsupported layouts, image-only PDFs, missing identity and missing responses are never replaced with guessed matches. OCR and rendered-proof assessment are not implemented.

Keeper separates exact author comments/questions, observed evidence, interpretation and suggested responses. “Done”, “Yes” and “Fixed” do not prove implementation. Formatting questions may require visual proof or supplied style rules. No automatic already-applied/pending classification or manuscript correction is performed.

## Verification

Run `node --import tsx tests/keeper-evidence.mjs`, `node --import tsx tests/keeper-chat-evidence.mjs`, `node tests/keeper-factory-reset.mjs`, `npx tsc --noEmit`, and `npm run build`.

The optional parity test uses `KEEPER_STAGE1_SOURCE` to point to the generator's `query-generator.html`; the developer's local reference is detected when available. API transport tests use isolated mocked authentication/provider responses; they do not alter real accounts or call a paid model. These checks do not constitute DTD/VTool validation or authenticated browser validation.

## Automatic upload inspection
Uploading or removing XML/PDF files automatically starts deterministic inspection through the authenticated `action: inspect` request, without contacting an AI provider. QA appears as soon as processing finishes. Questions wait until inspection is ready; failures show a retry control. Replacement, removal, reset, and unmount cancel the browser request and discard stale responses.

The server reuses a private process-local evidence cache keyed by authenticated user and exact artifact content/metadata. It expires after 15 minutes and has a bounded memory budget. Chat requests retain the source artifacts for bounded XML retrieval but reuse the inspection output. Cache eviction, server restart, or a different serverless instance may require deterministic reinspection; this does not call AI. Files and evidence are not persisted to a database. Pasted XML continues to be inspected when submitted.

## AI review failures
When providers are unavailable or cannot complete a review, the server returns a clearly marked deterministic query-response report with source locations, verified answers, and unresolved reasons. It does not claim AI interpretation or edit completion. At most 100 queries and approximately 180,000 characters are reported, with explicit incomplete/truncation notices. The full evidence remains retrievable. Run tests/keeper-query-review.mjs with tsx to verify batch retrieval and report coverage.

## PDF deployment runtime
PDF extraction explicitly loads the pinned native canvas dependency before PDF.js initializes DOMMatrix, ImageData, and Path2D. Both Vercel chat routes include the native platform package and PDF worker files. File summaries distinguish completed inspection from failed extraction; failed PDF inspections are not cached. If a PDF was uploaded but could not be read, query bindings report the actual extraction failure instead of asking for a missing upload. Run `node --import tsx tests/keeper-pdf-runtime.mjs` for native Node loading, actual synthetic PDF extraction/binding, and failed-versus-missing PDF regression coverage.

## Matching and completeness safeguards
Query wording retains meaningful punctuation, decimal points, operators, and word boundaries; only NFC, case, whitespace, and equivalent quote/nonbreaking-hyphen typography are normalized. Unsupported standalone or fused query boundaries are quarantined and cannot contribute a verified answer to a neighboring query. Clear page-number footers at page edges are excluded from decoded response text with a warning, while raw evidence is retained. Other footer layouts are not guessed away.

Whole-query requests and explicit all-query completion claims require complete retrieval of every XML query record, including long-record continuations. Partial retrieval is rejected so the deterministic report can be returned without an unsupported AI completion claim. Uploads and chat requests check the actual UTF-8 JSON payload, including base64, combined artifacts, and conversation overhead. Rejected replacements retain the previous files and report.

Regression suite: `node --import tsx tests/keeper-followup-safety.mjs`.

## Insertion/deletion counts
The allowlisted `summarize_opt_changes` function aggregates the full XML inventory by artifact, using case-insensitive opt_INS/opt_DEL kinds. Results include completeness, tag occurrence totals, flagged tags, and whitespace-only tags. Inactive XML comments and CDATA literals are not active edit tags. A successful empty inventory can establish zero; missing, failed, or capped XML inspection cannot establish exact totals. General XML diagnostics conservatively mark counts incomplete.

Simple document-level count questions dispatch directly to this tool and return its deterministic answer, without AI calls. Word/character counts, scoped-query counts, and compound review tasks are not silently replaced by document tag totals. The model also has the tool for conversational retrieval, and a count request cannot be answered after only reading queries. A model's count explanation is replaced with the deterministic count report for recognized count requests. This avoids unsupported absence claims based on an unrelated query page.

Run `node --import tsx tests/keeper-opt-counts.mjs` and `node --import tsx tests/keeper-chat-evidence.mjs` for counting and API routing coverage.
