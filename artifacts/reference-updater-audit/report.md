# Reference Updater audit — 2026-10-08

Read-only audit of `pages/ReferenceUpdater.tsx`. No application fixes or push performed. Twelve confirmed bug groups, plus one selection-policy concern.

## Confirmed defects

| # | Priority | Defect and reproduced effect | Source lines | Recommended correction |
|---|---|---|---|---|
| 1 | P1 | Numeric label alone authorizes replacement. Smith/2020/DOI alpha and unrelated Jones/2022/DOI different both labelled `[1]` automatically match, replacing the cited paper under its original ID. | 471–476 | Treat labels as supporting evidence; require review when bibliographic identity conflicts. |
| 2 | P1 | Content normalization discards Unicode and punctuation. Different Chinese names/titles collapse into the same content hash. DOI `10.1234/a-b` and `10.1234/ab` also become an exact content match without review. | 328, 446 | Preserve Unicode and meaningful identifier characters; evaluate DOI conflicts before accepting content equivalence. |
| 3 | P1 | Internal ID preservation stores one ID per prefix. Original `ir5`, `ir10` and incoming `ir900`, `ir905` become two `ir10` IDs. | 298–303, 917–918 | Map individual elements uniquely, reserve all allocated IDs, and reject duplicates. |
| 4 | P1 | Renaming internal IDs leaves their links unchanged. Incoming `tr900` becomes `tr5`, while `refid="tr900"` still points to the removed ID. | 909–925 | Apply the same explicit ID mapping to reference attributes and local fragment links. |
| 5 | P1 | Valid single-quoted XML IDs are not recognized. Original `id='bb5'` becomes a newly generated `bb3000` despite Preserve IDs being enabled, breaking body links after reinsertion. | 289, 298 | Parse XML attributes independently of quote style. |
| 6 | P1 | Disabling Preserve IDs permits an added entry to reuse an unchanged original bibliography ID. Unique allocation occurs, but the generated outer ID is not applied. | 897, 904–905 | Enforce uniqueness regardless of preservation preference. |
| 7 | P1 | Analysis survives input changes. Analyze A+B, reorder original input to B+A, then merge: corrected A replaces B under B's ID, while A is retained again. | 805–807, 875–877 | Bind analysis to input/settings snapshots and invalidate it on relevant changes. |
| 8 | P1 | External numeric labels silently replace original labels. Preview shows `[1]`, merged entry carries `[99]`, and this tool does not rewrite body citations. | 534, 877, 926–928 | Preserve numeric citation labels by default; require an explicit coordinated relabelling workflow otherwise. |
| 9 | P1 | Malformed XML is emitted with a success toast. Removing a closing `sb:maintitle` still permits analysis and merge. | 285, 1005 | Require well-formed input and validate the final XML before publishing success. |
| 10 | P1 | Review candidate indices refer to the wrong list. A candidate at updated index 1 is assigned original index 1; selecting and merging it drops `bb5` and emits two `bb10` entries. | 547–552, 1639–1641 | Represent original and updated candidate indices explicitly; verify the intended pair before merging. |
| 11 | P2 | Drag ordering is immediately undone. Moving the first reference below the second leaves projected output in the original order. | 1032, 1044–1055 | Preserve an explicit user order instead of sorting every projection by original index. |
| 12 | P2 | Bulk deselection does not handle duplicate rows; review bulk selection also excludes potential duplicates. Selected rows remain selected and can still be included. | 1011–1016, 1189 | Use the same filter predicate for visible rows and bulk actions. |

## Selection-policy concern

Unchecking a matched correction removes the original entry from output too. The queue filters unselected items before the merge's original-preservation fallback can run (line 1026). This behavior is reproduced, but whether it is a defect depends on whether selection means “include this reference” or “apply this correction.” The UI should make that consequence explicit; if selection means applying corrections, preserve the unchecked original.

## Evidence and verification

`audit.mjs` extracts the actual TypeScript component functions and the actual review-candidate click handler, then exercises matching, merging, drag ordering, and bulk selection with React state/timer plumbing replaced. Assertions confirm the outputs described above. It covers 15 scenarios: 13 defect reproductions (normalization has two), one non-colliding Preserve IDs disabled control, and the selection-policy concern. `results.json` records inputs, state transitions, outputs, and toasts; `summary.json` provides a compact index. This is a function-level audit, not a browser interaction test.

`validate.ps1` inserts original and merged fixtures into a previously validated full article test copy using the article 5.7 DTD and actual installed VTool 5.98.2. It validates wrong-paper replacement, collapsed internal IDs, and malformed XML separately. The test copy comes from the earlier XMLRenumber validation baseline; the production article is untouched. Native reports and `validation-results.json` are retained here. Structural validation cannot determine whether a cited paper was replaced with the correct paper.

Validation results: all three original fixture articles pass DTD and have zero VTool errors. Wrong-paper output also passes DTD and has zero VTool errors, demonstrating the semantic blind spot. Duplicate-ID output has one DTD issue and one VTool error. Malformed output has one DTD issue and three VTool errors. All six native runs report zero skipped checks; the valid originals retain two existing warnings.

Recommended fix order: wrong-paper matching and review candidate pairing; individual ID/link mapping and stale-analysis protection; XML validation and numeric label consistency; ordering and selection behavior. Each fix needs regression assertions for correct behavior, followed by DTD and VTool checks of full article outputs where applicable.
