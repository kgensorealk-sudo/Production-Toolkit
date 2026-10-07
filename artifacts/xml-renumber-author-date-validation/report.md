# XMLRenumber author–date conversion — 2026-10-08

## Fix

The citation formatter previously accepted numeric citation text only. A linked `WHO et al., 2020` citation was therefore left unchanged when its bibliography label `World Health Organization et al., 2020` became `[1]`.

Complete linked author–year citations now follow their existing reference targets. The acronym does not need to match the expanded bibliography label: `refid` already identifies the reference. No reference links or bibliographic data are inferred from plain text, and no IDs are changed by this fix.

```xml
<!-- Before -->
<ce:cross-ref refid="bb0005">(WHO et al., 2020)</ce:cross-ref>
<ce:bib-reference id="bb0005">
  <ce:label>World Health Organization et al., 2020</ce:label>
  <!-- existing reference content -->
</ce:bib-reference>

<!-- After -->
<ce:cross-ref refid="bb0005">[1]</ce:cross-ref>
<ce:bib-reference id="bb0005">
  <ce:label>[1]</ce:label>
  <!-- existing reference content -->
</ce:bib-reference>
```

Parentheses inside or outside the citation produce one configured bracket pair. Supported formatting wrappers, citation IDs, and page locators are retained. Fully resolved author–date groups are also numbered. The result is stable on a second pass, including when labels were already numeric.

Shared-bracket changes now require each contained citation to be eligible for conversion. Invalid target counts, grouped page locators, complex markup, unresolved links, and citations inside bibliography text remain unchanged and are flagged for review. Unlinked body text and non-bibliographic links are preserved.

## Validation

- 66 XMLRenumber and UI regression tests passed, including twelve new tests for this change and related bracket safeguards. The sentence `(This has been confirmed by WHO, 2020)` retains its closing parenthesis when the linked citation becomes `[1]`.
- TypeScript lint, production build, and `git diff --check` passed. Build reports its existing bundle-size and Browserslist-data notices.
- Four complete article fixtures exercise external parentheses, internal parentheses, italic formatting with page locators, and a WHO/Smith citation group. Each input and repaired output passed the installed article DTD and VTool 5.98.2.
- All nine native runs (eight fixture articles plus unchanged baseline) report zero errors, zero skipped checks, and the same two baseline warnings: MSC529 and ROL517.
- Each full-article conversion processed 47 references with no renumbering QC issues and unchanged output on a second pass.
- The final engine was checked against the exact DTD/VTool-validated article outputs.

Fixtures were created in temporary copies of an existing production article; the original article was not edited. The fixture author lists follow the DTD rule that an `sb:et-al` marker follows an `sb:author`, rather than a collaboration by itself. Native positive fixtures use literal Unicode. Separate unit tests verify preservation of numeric entity spelling in locators; VTool rejects such entities, so those unit inputs are not claimed to be VTool-valid.

Evidence is saved in `case-results.json`, `dtd-results.json`, `vtool-results.json`, and `vtool-logs/`. `prepare.mjs --verify-existing` verifies the current engine against the saved temporary outputs; `validate.ps1` performs native DTD/VTool checks using the installed validators.
