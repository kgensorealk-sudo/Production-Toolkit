# Duplicate review fixes

Primary review candidates now explicitly identify indices in the updated list; secondary duplicate candidates identify indices in the original list. Candidate selection and highlighting follow that distinction, and primary candidate previews show the incoming candidate rather than repeating the original text.

Secondary duplicate rows cannot act as the original owner when confirming a merge. Splitting a secondary duplicate converts only the incoming row into an addition, retaining the already-present original owner exactly once.

Three focused regressions cover the reproduced primary wrong-list index bug, secondary merge ownership with reordered rows, and secondary split preservation. The prior 32 regression scenarios also pass. TypeScript and diff whitespace checks pass.

Original/output full article copies for the primary review reproduction pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and zero skipped checks, retaining two existing warnings. Source-text fixture IDs use an unused range to avoid collisions with section IDs elsewhere in the test article. Reports and validation-results.json are retained here.

This does not implement automatic removal of bibliographic duplicates, nor does it fix the remaining duplicate-filter bulk selection issue. Manual review remains required for potential duplicates and conflicts. No push performed.
