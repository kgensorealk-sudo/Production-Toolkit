# Keeper current workflow audit — 2026-10-09

Confirmed and corrected:
- Negated count requests could execute counts despite the user's instruction. Negated clauses no longer trigger the count path or count-retrieval obligation.
- Count-plus-explanation requests could silently return only counts. They now enter evidence review; explaining/describing every OPT change carries full-record retrieval obligations.
- A successful unrelated tool read could permit an answer about a specific qN. Known requested query records must now be fully retrieved before an answer is accepted.
- Saved broad instructions could contaminate retrieval guards for a narrower current question. Guards now use the explicit current question where supplied.
- Text-only model timeout did not cancel the underlying provider request. Gemini/OpenAI calls now receive cancellation signals, and the browser API call has a 75-second timeout with cleanup.

Verification: targeted regression cases plus existing Keeper suite, TypeScript, and isolated release build. Provider interactions in regression tests are mocked; they prove dispatch and guards, not production model availability.

Pending: authenticated live production verification and diagnosis of the previously reported Gemini failures. No production credentials were changed. Do not describe the broader Gemini connection issue as resolved by these fixes.
