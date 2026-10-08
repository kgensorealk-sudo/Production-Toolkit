# Reference Updater follow-up fixes

All eight findings from the follow-up audit are addressed.

| Finding | Corrected behavior |
| --- | --- |
| Candidate switch loses the displaced incoming update | Preserve it as a separate review row; absorb the selected candidate's secondary row without duplicating it. |
| Split loses an addition when a shared sibling is deselected | Only selected owners count; retain the incoming entry as an addition when no selected owner remains. |
| Outer ID collision with Preserve IDs off | Retain the matched original's ID when the incoming ID belongs to another original. |
| Cross-entry links remain stale | Resolve changed entries' links using bibliography-wide ID mappings, with local mappings taking precedence. |
| Cross-reference IDs collide | Include every actual ID-bearing element in allocation and preservation; reject duplicate output IDs when standardization is disabled. |
| Commented references are emitted | Parse actual element boundaries; ignore comment, CDATA and DOCTYPE markup as reference elements. |
| Malformed XML is emitted successfully | Reject malformed tags, attributes, entity references, invalid characters and duplicate IDs before generation. |
| Dragged order resets | Preserve the selected manual sequence when alphabetical sorting is off. |

Related safeguards cover displaced corrections through Keep as Merge, repeated split actions, and entity-encoded link targets.

## Verification

- 91 Reference Updater regression scenarios passed, including 21 new follow-up scenarios.
- TypeScript check and production build passed. Build retains existing bundle-size and Browserslist warnings.
- Eight valid fixture cases, both original and generated output, were inserted into full article test copies: 16 DTD validations and 16 native VTool checks passed with zero errors and zero skipped checks. Each retained the baseline's two unrelated warnings (MSC529 and ROL517).
- Malformed and duplicate-ID input cases are rejection tests, not positive DTD fixtures.

`validation-results.json` and the per-case VTool XML files contain evidence. `validate.ps1` reproduces article validation using the local DTD assets and baseline paths stated in that script. Test copies use distinct source-text IDs to avoid unrelated article section IDs. The split fixture deliberately excludes an original reference; only its validation article's body links are retargeted to the retained new entry. The updater itself emits bibliography XML and does not rewrite body citations.

The runtime scanner checks XML structure and ID/link consistency. It does not perform full DTD or native VTool validation inside the application.
