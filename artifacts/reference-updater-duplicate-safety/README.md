# Duplicate selection and incoming duplicate audit

Bulk selection and row visibility now share one predicate. Duplicate filtering includes potential duplicates and repeated incoming entries; review filtering includes all pending duplicate rows. Deselecting unwanted entries excludes them from the pending-review merge gate.

Shared incoming matches are flagged across original rows, including potential-duplicate matches. A regression confirms that approving one original leaves the other unreviewed and blocked even with Auto-Confirm enabled.

Repeated incoming entries sharing a nonempty DOI or exact normalized content are flagged for explicit review. They appear in duplicate filtering and the review modal explains why. No automatic deletion is performed: users can deselect unwanted copies or explicitly approve retained entries. This is DOI/exact-content detection; it does not guarantee discovery of every differently written duplicate.

Five safety regression scenarios and all 35 previous scenarios pass. TypeScript and diff checks pass. Original/output full article copies for repeated corrections, after choosing one correction and deselecting the extra, pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and skipped checks, retaining two existing warnings. Reports and validation-results.json are saved here.

No push performed.
