# Numeric-label matching fix

Numeric bibliography labels are list positions and no longer authorize label-only matches. Other matching paths continue to operate. Unmatched originals are retained; unrelated incoming references remain separate additions when Add Orphans is enabled.

Verification: `node tests/reference-updater-numeric-label.mjs` passes eight scenarios (five numeric label styles, separate addition, genuine DOI correction, descriptive label compatibility). `npm run lint` and `git diff --check` pass.

Original and output full article copies for the wrong-paper case and genuine DOI correction all pass article 5.7 DTD and installed VTool 5.98.2: zero errors and zero skipped checks, with two existing warnings. See `validation-results.json` and native XML logs. The test article baseline was already prepared and validated during XMLRenumber work; the production article is untouched.

This change addresses audit bug 1 only. The remaining matching, ID, stale-analysis, and UI defects are still outstanding. No push performed.
