# Reference Updater severe follow-up audit

Four failures reproduced. This audit adds evidence only; it does not implement fixes. Previously completed fixes remain in the working tree.

| Priority | Finding | Reproduction and consequence | Recommended correction |
| --- | --- | --- | --- |
| P1 | Preserve IDs off breaks body citations | A matched correction changes `bb0005` to incoming `bb0900`. The unchanged article body still cites `bb0005`. Reproduced with both bibliography-only and full article input. | Preserve existing outer reference IDs for matched corrections, or block changing an ID used by supplied body citations. The tool emits bibliography only, so it cannot repair the body itself. |
| P1 | Deselecting a cited original silently removes its target | Deselecting the sole original produces a successful empty result. Inserting it into the article removes `bb0005` while body citations still target it. | Check body links when full article input is available and block removal of cited targets. With bibliography-only input, clearly explain that exclusions require checking body citations; do not invent replacement targets. |
| P1 | A blocked merge retains old output | Generate once, change the review decision to an unreviewed conflict, then merge again. The merge correctly blocks but the old output remains available. It can be mistaken for the current decisions. | Invalidate output when review, selection, order or generation settings change; associate output with the exact generation state. Clear or mark invalid results on failed or blocked generation. |
| P1 | Undeclared named entities pass generation | Incoming title contains `&undefinedEntity;`. Analysis and merge succeed, emitting that undeclared entity. Full article XML validation rejects it. | Validate named entities against available declarations/DTD context. For standalone fragments, handle supported DTD entities and reject unknown names with an actionable error. Avoid removing support for legitimate DTD entities. |

## Validation evidence

| Article test case | Original DTD / VTool errors | Generated output DTD issues / VTool errors |
| --- | --- | --- |
| Preserve IDs off | 0 / 0 | 1 / 2 |
| Deselect cited reference | 0 / 0 | 1 / 1 |
| Blocked merge retains stale output | 0 / 0 | 0 / 0 |
| Undeclared entity | 0 / 0 | 1 / 3 |

All eight native checks completed with zero skipped checks. The two unrelated baseline warnings remain. The stale-output case is a workflow correctness failure; XML validators cannot detect outdated review decisions.

`audit.mjs` asserts the reproduced failing behavior and writes `results.json`. `validate.ps1` inserts each original/output bibliography into a full article copy and runs DTD validation and native VTool. No body retargeting was performed for these cases. The production source article was not edited. Absolute local baseline, DTD and VTool paths are recorded in the script. Native logs and `validation-results.json` are included.

## Checks without new severe findings

Twenty existing targeted scenarios passed: name-date title/full-author evidence (4), numbered identity rules (5), shared split ordering and occupied `bb3000` allocation (3), and stale input analysis safeguards (8). These checks cover specific cases, not proof that every possible sequence is safe.

Namespace declarations on a wrapper are omitted when emitting bibliography fragments. This was recorded as a fragment boundary, not a confirmed severe defect: the output normally inherits the article's namespace/DTD context. Do not treat generated fragments as standalone namespace-complete documents.

Recommended order: protect body citation targets first, then invalidate stale output, then tighten entity validation with the actual DTD context.
