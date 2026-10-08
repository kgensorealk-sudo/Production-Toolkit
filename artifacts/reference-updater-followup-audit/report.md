# Follow-up Reference Updater audit — 2026-10-08

Audited the pushed implementation at 63bf760. No application edits or push in this audit. Six additional confirmed failure cases and two previously reported outstanding defects. The harness exercises actual component functions and the actual candidate-selection handler; assertions in audit.mjs confirm every listed result. This is function-level verification, not a browser interaction test.

| Priority | Finding | Reproduction and effect | Source |
|---|---|---|---|
| P1 | Candidate switching loses an incoming entry and can duplicate another | One original initially targets incoming A. Incoming B also has a secondary review row. Select B for the original, confirm it, then split B's secondary row. A disappears from the scan/output; B is output twice under different IDs. Candidate selection changes only one row without reconciling ownership of old/new candidates. | 1766–1771 |
| P1 | A deselected shared match swallows an explicitly split incoming reference | Two originals share one incoming candidate. Deselect the second match, then split the first. Split treats the unselected second row as still handling the incoming entry. Output contains no incoming addition, despite Split promising to keep it. | 824–832 |
| P1 | Preserve IDs disabled still permits duplicate IDs on matched corrections | Original entries bb0005 and bb0010 are separately valid. A correction for bb0005 arrives with ID bb0010. With Preserve disabled, output retains the incoming bb0010 plus unchanged original bb0010. The earlier addition-ID fix does not cover matched updates. | 1001–1006 |
| P1 | Links between bibliography entries remain dangling | Incoming A's bb0900 is renamed to original bb0005. Incoming B contains refid="bb0900" pointing to A. B's local remapping dictionary knows only B's renames, so the final link still targets removed bb0900. The earlier link fix covered links within a single entry. | 1000, 1036–1044 |
| P1 | Unmanaged element IDs collide across separately valid inputs | An unchanged original contains cross-ref ID cf0900. A corrected different entry also contains cf0900. Neither input has duplicate IDs, but merge emits two cf0900 IDs because ce:cross-ref is excluded from internal ID rewriting. Similar unsupported ID-bearing elements need auditing. | 314, 1014 |
| P2 | Commented-out references become real output entries | Append a valid XML comment containing an old ce:bib-reference to incoming XML. Regex parsing treats the commented block as a reference, then emits it outside the comment as a new entry. | 301 |
| P1 | Malformed XML is still emitted — outstanding earlier finding | Remove a closing sb:maintitle from the incoming correction. Merge returns malformed markup with a success toast. | 301, merge success path |
| P2 | Drag ordering is still reset — outstanding earlier finding | Drag first original below second. The projected output immediately sorts them by originalIndex and returns the old order. | 1158, 1170 |

## Verification

All eight reproductions pass assertions that confirm the buggy behavior. results.json preserves inputs, output, analysis state and toasts. For candidate switching, the final output contains the chosen incoming title twice and omits the displaced incoming title. For split/deselection, the incoming title never reaches output.

The first three structural ID/link cases have original/output full-article DTD and actual VTool 5.98.2 validation in validate.ps1, validation-results.json and native XML reports. The test script replaces the first two production bibliography entries in an existing validated article test baseline; production XML is untouched. Structural validation cannot detect all lost-reference or wrong-content errors.

All three original test articles pass DTD and VTool with zero errors. Preserve-disabled output has two DTD/VTool errors (duplicate ID and missing original citation target). Cross-entry-link output has one DTD/VTool error (missing target). Cross-ref-ID collision output has one DTD/VTool error (duplicate ID). All six native runs have zero skipped checks.

## Recommended fix order

1. Reconcile ownership when changing a match candidate: represent each retained original and incoming entry once, and preserve displaced incoming entries for explicit disposition.
2. Make split account for selected rows and ensure an incoming entry has exactly one active representation.
3. Enforce final ID uniqueness regardless of Preserve preference; handle all ID-bearing elements.
4. Apply a complete bibliography ID map to links between entries, using source-aware resolution where inputs reuse IDs.
5. Parse XML structure to reject malformed input and ignore comments/CDATA as element markup.
6. Preserve explicit drag order.

Do not silently delete existing references or uncertain incoming entries while implementing these corrections.
