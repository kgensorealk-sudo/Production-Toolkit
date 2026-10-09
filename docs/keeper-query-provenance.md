# Phase 1 strengthening: query-response provenance

The read-only local panel lists every extracted XML query, 20 per page. Each row shows its query ID, XML filename/line/character location, question excerpt, association state/reason, and only an established PDF response with filename/page. The existing strict DOI + unique query ID + normalized wording matching algorithm remains unchanged; neighboring or ambiguous responses are never substituted.

An established association is displayed only when both inspected files and the referenced PDF record exist and the stored response agrees with the PDF record response. Failed, missing or inconsistent provenance suppresses the response and requires reinspection. Unresolved, conflicting and ambiguous associations never expose a stored candidate answer as an assigned response.

Author answered means "matched response available". Edit verified always remains "not verified by this tool". A response cannot promote itself to edit verification. This panel is independent of AI answers and never increases Keeper's retrieval or batch coverage. Local reinspection restores the panel after refresh; it does not add a second persisted copy of manuscripts.

Full-record controls expose XML question, matched PDF question and author response, both source hashes and record IDs. Long fields continue in 5,000-character slices. Table excerpts are 500 characters with explicit disclosure, and all extracted queries remain reachable through pagination. File limitations are shown; rendered text is escaped.

Release includes the separately requested personal Gemini key and finding-coverage features. Personal keys are masked, account-scoped memory only, passed to the server as a request header and then to Gemini; no environment mutation or cross-provider fallback is permitted. Authentication remains required. Provider errors are logged by category rather than raw credential-bearing messages. No user key is used in automated tests.

Verification: the complete Keeper suite, TypeScript and isolated production build passed. Query provenance tests cover strict matching, page/line locations, unassigned ambiguous/conflicting answers, missing pointers, inconsistent response text, pagination and escaping. Browser checks reached queries 21–40 and 41–45, then retrieved characters 5001–6504 of the matched author response with correct PDF page/hash provenance. API-key and AI serialization tests use mocked provider transport, not a real personal key. Existing bundle-size and Browserslist build warnings remain.
