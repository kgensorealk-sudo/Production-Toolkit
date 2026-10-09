# Keeper current workflow audit — 2026-10-09

Confirmed and corrected:
- Negated count requests could execute counts despite the user's instruction. Negated clauses no longer trigger the count path or count-retrieval obligation.
- Count-plus-explanation requests could silently return only counts. They now enter evidence review; explaining/describing every OPT change carries full-record retrieval obligations.
- A successful unrelated tool read could permit an answer about a specific qN. Known requested query records must now be fully retrieved before an answer is accepted.
- Saved broad instructions could contaminate retrieval guards for a narrower current question. Guards now use the explicit current question where supplied.
- Text-only model timeout did not cancel the underlying provider request. Gemini/OpenAI calls now receive cancellation signals, and the browser API call has a 75-second timeout with cleanup.

Verification: targeted regression cases plus existing Keeper suite, TypeScript, and isolated release build. Provider interactions in regression tests are mocked; they prove dispatch and guards, not production model availability.

Authenticated live production verification (2026-10-09): passed using synthetic pasted XML containing one opt_INS and one opt_DEL. For an explanation request, Gemini requested inspect_sandbox_evidence, retrieved both records (2/2), and correctly described both changes. Total 10.53 s; API 6.20 s; server 5.45 s. gemini-3.8-flash returned quota_or_rate_limit in 0.15 s; gemini-3.1-flash-lite succeeded in 3.73 s. This demonstrates working fallback and evidence retrieval, not universal provider availability or a diagnosis of every historical timeout.

The subsequent count request returned the correct totals through summarize_opt_changes in 1.31 s, with one tool call and zero model rounds. Saved explanation instructions did not override the narrower count request.

Found and corrected locally: standalone-workspace help text incorrectly claimed cloud interpretation was disabled. It now explains local automatic inspection and extracted-evidence transmission when asking Keeper. No production credentials were changed. The first model's quota/rate limitation remains an operational limitation.

Subsequent local fixes: failed empty inspections produce explicit insufficient-evidence replies rather than allowing unsupported zero-change claims. Count-only routing accepts only conservative count wording, so mixed requests retain their additional actions.

Resumable review batches: requests covering all/each queries or all/each OPT categories use bounded record batches when necessary. Progress and the continuation cursor persist with each answer in the existing per-user/task local workspace. Continue uses the original question; source hashes, inventory IDs and task identity are checked before resuming. Required batch records must be fully retrieved before advancing. Counts always use the full inventory, not the batch subset. Scope-only or failed responses do not advance. This is coverage of retrieved evidence and returned answers, not proof of editorial completion. Inspection caps remain; exceptionally long single records can still exceed the model/tool budget and require a narrower request.

Verification: synthetic 23-query three-batch loop, OPT batching, failed retry, stale source/task rejection, unrelated-read rejection, and authenticated API transport mocks. Live Gemini and browser interaction with the new controls have not yet been tested. These batch changes are local and not deployed.
