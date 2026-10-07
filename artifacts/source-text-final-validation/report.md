# Source-text fixes and ID-tool handoff — 2026-10-07

The remaining listed source-text audit defects are addressed. This tool preserves IDs and leaves missing IDs unassigned, including on newly generated source-text. ID assignment and correction are delegated to the separate ID tool.

## Changes

| Audit finding / request | Current behavior |
| --- | --- |
| Multiple structured references were formatted using only the first reference | Every direct structured reference is processed and followed by its own source-text. Existing source-text associated with a later reference is preserved. |
| Ambiguous existing source-text placement | Warns and defers generation rather than guessing an association or adding another copy. |
| CDATA cleanup removed literal markup | CDATA, XML comments, and processing instructions are shielded from tag cleanup. Supplied source-text content is retained. XML comments are excluded from generated citation text. |
| Consecutive URL commas were collapsed | Removed global comma collapsing; URL paths and query strings retain their supplied punctuation. |
| Explicit inline spacing disappeared | `ce:hsp` and `ce:vsp` are rendered as spacing on a clone used for source generation; zero spacing remains zero. Original structured markup is retained. |
| DOI display punctuation looked like a second DOI | A label differing from the supplied DOI target only by its final display period renders one target. The original label/href and actual DOI punctuation remain unchanged. |
| Missing/empty/duplicate source-text was marked valid | Scanner and repair audit report missing IDs, duplicate IDs, empty text, child markup, and misplaced source-text as warnings. Existing empty text is preserved for review. |
| Unsupported DTD-verification success claims | Removed claims from scanner messages, repair completion messages, and UI banners. The UI requires subsequent DTD/VTool validation. |
| Requested removal of missing-ID generation | Removed ID allocation, ID reassignment, and the starting-ID control. No missing IDs are created, and existing IDs are preserved for the ID tool. |
| Namespace cleanup could strip local MathML bindings | Original local bindings are retained. Only synthesized wrapper bindings are removed; DTD testing also confirmed that these synthesized attributes must not be added to bibliography elements. |

The earlier malformed marker, source placement, and DOI preservation repairs remain covered by this validation run. No bibliographic data is fetched or invented.

## Validation

- 51 unit tests passed, including CDATA preservation, URL commas, DOI punctuation, duplicate-ID detection, and namespace preservation.
- Actual scanner/repair functions ran in Chrome with native DOMParser/XMLSerializer across 32 scenarios. Semantic assertions passed for all scenarios, including unchanged missing/existing/duplicate IDs, source-text association and supplied-text preservation. The declared named-entity case is explicitly retained for review because an isolated browser fragment cannot resolve its external DTD entity.
- 26 positive repaired cases plus the unchanged article baseline passed the installed article DTD.
- VTool 5.98.2 validated those same 27 complete article clones with zero errors and zero skipped checks.
- Two baseline warnings remain (MSC529 and ROL517). The uppercase-title fixture additionally reports TTS502; the XML-comment preservation fixture additionally reports XML503d. These fixture conditions were preserved rather than silently rewritten.
- Six negative cases correctly produce VTool errors: missing source ID, all missing IDs, duplicate source ID, duplicate structured-reference ID, misplaced source-text, and existing empty source-text. DTD rejects the first five; empty source-text is allowed by the DTD but rejected by VTool.
- TypeScript lint, production build, and `git diff --check` passed. Build output reports its existing large-bundle and old Browserslist-data notices.

## Required workflow

Repair/source generation → separate ID tool → full-article DTD and VTool validation.

**Positive validation uses IDs added only to temporary test copies to simulate the separate ID step. Product output still has missing IDs.** The DTD declares source-text IDs required, so raw output with newly generated source-text must not be treated as DTD-valid before ID assignment.

Empty supplied text, duplicate IDs, ambiguous source placement, and unsupported declared entities remain review conditions. The tool reports these rather than claiming that every possible input has been repaired or validated. The original production article was not edited.

## Evidence

- `browser-results.json`: actual scanner/repair inputs, outputs, and messages.
- `semantic-results.json`: browser regression assertion result.
- `dtd-results.json`: DTD results for positive and negative cases.
- `vtool-results.json` and `vtool-logs/`: parsed native results and full reports.
- `validation-jobs.json` and `validation-directory.txt`: temporary full-article validation fixtures.
- `validate.py`: semantic assertions and native orchestration; `--semantic-only` reruns assertions without native checks.
- `validate-dtd.ps1`: installed-DTD validation.

The previous audit and priority-validation reports are historical snapshots; this report describes the current behavior.
