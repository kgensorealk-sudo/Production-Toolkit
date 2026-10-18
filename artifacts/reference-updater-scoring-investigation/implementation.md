# Reference Updater repair and verification

Implemented locally on 2026-10-18. The earlier investigation and `results.json` remain historical evidence. `verification-results.json` records the same 22 scenarios on the repaired implementation.

## Changes

- Comparison text is read from parsed XML nodes. Predefined/numeric entities decode consistently, literal CDATA remains literal, and inline tags/comments do not add spaces inside words. Structured fields retain separation.
- Titles and authors are extracted from contribution scope, avoiding host-title selection and editor contamination when a contribution is present. Structured and inferred title/year evidence is recorded separately. Plain-text title inference handles an unparenthesized year without including that year and author prefix in the inferred title.
- DOI normalization trims whitespace after a recognized DOI prefix. Genuine differing identifiers still require review.
- Candidate searches continue past weak descriptive-label hits. Exact-content/DOI identity retains priority; otherwise consistent structured title/author/year evidence is ranked before weaker candidates. The candidate list retains alternatives.
- Author-list, structured-year and word-boundary disagreements require review across matching routes. Label matches retain their existing review-required category. Auto-Confirm cannot bypass these decisions.
- Unused alternative candidates require review before becoming separate additions. Secondary duplicate detection still runs for these entries. Changing a chosen candidate invalidates its confirmation and requires fresh review.
- The interface labels the evidence result as a match score out of 100. The review panel separately displays reference-text similarity and title/author evidence, identifying inferred titles and missing authors.
- Source text is retained as comparison evidence rather than silently discarded. A structured/plain pair with missing author evidence may legitimately remain an 80/100 review candidate.

## Verified outcomes

| Scenario | Before | After |
| --- | --- | --- |
| Equivalent short ampersand encoding | Label 76 | Content 100 |
| Equivalent literal CDATA | Label 56 | Content 100 |
| Unchanged word with inline formatting | Label 80 | Content 100 |
| Different visible word boundaries | Content 100, merges by default | Full-Text 94, review required even with Auto-Confirm |
| Different third author | Full-Text 96, Auto-Confirm merges | Conflict, review required |
| Different structured publication year | Full-Text 99, Auto-Confirm merges | Conflict, review required |
| DOI prefix followed by whitespace | False conflict | DOI 100 |
| Weak label versus stronger metadata candidate | Weak 69 selected first | Strong 100 selected; unused alternative requires review |

Explicitly approving a legitimate author correction still produces output with the corrected author and the original bibliography ID.

## Validation

- All 25 existing Reference Updater test entry points passed on the final code.
- Added 16 maintained regression scenarios to `tests/reference-updater-content-match.mjs`; that entry point also retains its original six scenarios and Unicode/punctuation assertions.
- Re-ran the 22-case investigation matrix and saved post-fix evidence separately.
- `npm run lint` passed (`tsc --noEmit`).
- `npm run build` passed. It reports Browserslist data age and bundle-size notices; no build errors.
- `git diff --check` passed for the changed application and regression files.

No browser or publisher-DTD claim is made. The actual YBCMD input pair remains unavailable at the prior recorded paths. These checks exercise the real parser, matching, candidate-change, review and merge functions through the existing AST harness. No production deployment was performed as part of this verification.
