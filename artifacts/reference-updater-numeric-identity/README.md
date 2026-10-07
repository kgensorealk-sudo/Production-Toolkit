# Different numeric labels remain separate

User rule: an incoming reference numbered [99] must never replace existing [1]. Matching excludes pairs whose numeric labels differ across all primary matching paths and secondary duplicate detection. A merge guard also rejects such replacements if a row is manually or incorrectly mapped. DOI equality does not override this rule.

The original entry remains unchanged. Auto-Add enabled treats the incoming entry as a new reference with an available ID starting at bb3000; disabled leaves it excluded. Equivalent representations of the same number (such as [1] and (1)) remain eligible for matching. Name-date/unlabelled matching behavior is unchanged.

Five regression scenarios cover equal DOI, otherwise identical content, Auto-Add disabled, equivalent numeric representations, and rejecting a forced wrong mapping. All 58 reference updater scenarios, TypeScript and diff checks pass.

Original/output full article test copies pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and skipped checks and two existing warnings. For the output validation copy only, a body citation to the newly added bb3000 is inserted so VTool can validate a cited new reference. Application output remains bibliography blocks only. No production XML is modified.

No push performed.
