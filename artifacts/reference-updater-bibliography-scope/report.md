# Bibliography extraction scope

For full article XML, only ce:bib-reference entries contained within ce:bibliography are extracted. Reference-shaped elements in body/other sections are ignored. An article without ce:bibliography returns no references, and Analyze reports the missing bibliography instead of treating unrelated content as entries.

Reference-only fragments remain supported: bare ce:bib-reference lists, ce:bibliography-sec wrappers, and complete ce:bibliography fragments. If a bibliography wrapper is present, extraction is scoped to it even without an article wrapper. Comments and CDATA do not create element containers.

Scoping is applied in the common XML scanner, so matching and original bibliography citation-target classification use the same boundary. IDs elsewhere in the supplied XML still participate in collision avoidance and external target handling.

162 Reference Updater regression scenarios passed, including ten boundary cases. TypeScript and production build passed. The user's full original and updated YBCMD_103036 inputs were replayed through the real matching/generation functions after explicit test review. The resulting full article test copy passes DTD; native VTool reports the same three original errors and 14 warnings, with zero skipped checks. Errors remain carriage returns, BOM, and author-ID MD5. No missing bibliography targets or duplicate [12] appear. Native evidence is in artifacts/reference-updater-user-YBCMD-103036/after-fix-validation.json and after-fix-vtool.xml.

The synthetic body containing a bibliography element in the extraction test is a boundary probe, not a positive DTD article fixture. Neither user-supplied source file was edited. Generated output remains bibliography only.
