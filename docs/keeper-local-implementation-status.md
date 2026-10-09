# Local Keeper implementation status

2026-10-09. Updated Keeper interpretation workflow; ZIP storage and background inspection remain local.

Implemented:
- Browser workers inspect imported XML/PDF with the shared deterministic inspection core. Node's hashing/PDF runtime remain behind a server adapter for regression parity.
- Keeper chat is enabled directly, without the cloud-chat checkbox. Imported-file questions send the locally extracted evidence snapshot (not ZIP/PDF/full XML source files) to the authenticated application API. Gemini requests allowlisted evidence tools and receives their bounded outputs before answering. Browser-reported evidence is validated but is not represented as independently inspected on the server. Raw article excerpt retrieval is unavailable in this mode. Provider failures remain explicit; detailed QA is available separately. Markdown result images remain suppressed.
- Account-scoped IndexedDB retains workspace source files, prompts and conversations across refresh. Daily deletion and global history restoration are removed. Account changes invalidate old operations and hide old workspace content during restoration. This is application isolation, not encryption against someone with browser-profile access.
- Local ZIP tasks accept multiple packages, save originals, detect duplicate byte hashes, extract selected article XML/PDF locally and retain detailed preparation results. Users select an article package to open it. Unfinished preparation is retried on reopening; failed tasks offer retry.
- Archive validation rejects unsafe paths, symlinks, encrypted entries, ambiguity and oversized data. Selected evidence extraction verifies CRC and enforces actual byte limits. Unselected attachments remain in the original ZIP and are not extracted/fully validated. ORDER presence is checked by matching basename; ORDER semantics are not yet interpreted.
- No Supabase task/file writes or Google Drive integration were added. Summary sync is deliberately disabled.

Current limits: ZIP 25 MiB, central-directory expanded total 64 MiB, 1,000 entries, selected XML/PDF 4 MB each, existing PDF inspection 150 pages/1.5M extracted characters. Local imported XML/PDF combined legacy encoded-size guard remains in place. No silent truncation to fit these limits.

Validation:
- Existing Keeper regression suite passed after the shared-core refactor; tests use synthetic sources and mocked provider transports.
- New XML adapter parity/privacy-route checks and local ZIP role/ambiguity/missing-file/invalid-archive/size/path checks.
- Browser harness verified actual bundled ZIP worker extraction, actual PDF.js worker extraction, strict XML/PDF response binding and IndexedDB round-trip/owner-key isolation.
- TypeScript and production build checked. Browser harness does not replace authenticated full-UI account-switch and refresh testing; these remain rollout checks.

Remaining before the complete planned task product:
- Safe optional Supabase summary schema/API and tenancy tests; no cloud syncing currently occurs.
- Full task/history backup import/export and deletion/archive controls. Users should retain original ZIPs; clearing browser data removes local records.
- Immutable task revisions for attached missing files, ORDER identity inspection, and richer source-role candidate selection. Manual XML/PDF attachment currently updates the local workspace; it does not rewrite the saved original package.
- Longer PDF page checkpoints; interrupted extraction restarts from retained local sources rather than resuming a page checkpoint.
- On-demand browser excerpt relay for questions needing article context beyond extracted records. Current AI evidence includes extracted OPT/query records and verified response associations only.
- Authenticated production provider verification remains a rollout check. The local Gemini key was rejected by Google; production credentials are not inferred from that result.
