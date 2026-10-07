# Investigating same author-year labels

Same-label candidates are ranked using title similarity and all structured listed authors in order, including given names where supplied. A later-author difference affects ranking even when the first two authors agree. Missing metadata supplies no positive evidence; et-al-truncated author lists do not qualify as complete-list matches. Label-based matching remains subject to manual review regardless of score or Auto-Confirm.

Review displays both ordered author lists and a title-similarity/author-evidence summary. Existing DOI conflict, ambiguity, duplicate and numbered-reference safeguards remain in place. This change targets same-label candidates; it does not assert that unavailable unstructured authors have been recovered.

Four new regression scenarios cover choosing the better title/author candidate, comparing later authors, extracting supplied given names and surnames, and handling truncated lists. All 67 Reference Updater scenarios, TypeScript and diff checks pass.

Original/output full article copies for the manually reviewed title/author match pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and skipped checks, retaining two existing warnings. Native reports and validation-results.json are saved here. No push performed.
