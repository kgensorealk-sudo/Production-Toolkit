# Source-text priority repairs — 2026-10-07

## Fixed

- Empty marker restoration preserves complete paired and self-closing `sb:et-al`, `sb:ellipsis`, and `ce:ellipsis` elements. Literal marker strings in CDATA and XML comments are excluded from this restoration.
- Newly generated `ce:source-text` is inserted immediately after its structured reference, before trailing `ce:note` elements.
- DOI migration preserves complete identifiers, including percent-encoded suffixes.
- Electronic hosts with dates, versions, access dates, attributes, descriptive labels, conflicting link information, or ambiguous destinations are retained with an audit warning. Their original data remains available for source-text generation.
- An existing identical target DOI is reused. A different target DOI prevents migration instead of creating a second DOI element in that host.
- Explicit accept/retain decisions remain effective; surrounding bibliography comments are preserved.

These changes do not fetch or invent bibliographic data. Migration only relocates a DOI already present in a DOI-only electronic host when the destination is unambiguous.

## Validation

- 45 unit regression tests passed; TypeScript lint and `git diff --check` passed.
- Actual generator and repair functions ran in Chrome with native DOMParser/XMLSerializer across 26 audit scenarios. Eleven targeted cases passed explicit semantic assertions for these fixes; the remaining scenarios are audit evidence, not a claim that their bugs are fixed.
- The eleven repaired bibliography cases were inserted into temporary copies of a production article. All eleven and the unchanged baseline passed the installed article DTD using .NET XML validation.
- VTool 5.98.2 ran sequentially on the eleven repaired articles and baseline. All twelve parsed reports show zero errors, zero skipped checks, and the same two baseline warnings: MSC529 (grant sponsor ID) and ROL517 (role attribute).
- The original production article was not edited. DTD and VTool reports are retained beside this report.

## Still outstanding from the audit

Multiple structured references and source-text association; general CDATA cleanup; URL comma preservation; inline `ce:hsp` spacing; empty/missing/duplicate source-text ID auditing; unsupported schema-verification success messages; and DOI display-label punctuation handling. Marker restoration's CDATA protection does not fix the separate general cleanup bug.

Evidence: `browser-results.json`, `dtd-results.json`, `vtool-results.json`, and `vtool-logs/`. `validate.py` includes eleven semantic assertions and native validation orchestration; `validate-dtd.ps1` performs DTD validation. Fixtures use the installed production article and local extracted DTD assets recorded in `validation-directory.txt`.
