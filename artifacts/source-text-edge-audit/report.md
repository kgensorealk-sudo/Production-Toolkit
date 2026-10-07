# Source-text edge-case audit — 7 October 2026

No production application code was changed during this audit. The audit harness and evidence are saved in this directory.

## Method

- Ran the actual analyzeXml and executeRepair functions and their helpers in headless Chrome, using real DOMParser/XMLSerializer, for 21 cases.
- Embedded each input and repaired output into an isolated copy of the production article, maintaining its bibliography ID/label. No original article was edited.
- Validated 43 full documents: baseline plus 21 input/output pairs, against the installed art570.dtd and associated bundled schemas.
- Ran VTool 5.98.2 (checks 2.98.2) with -forcecheck -nofp on every document, reading native report totals and messages.
- The baseline has 0 errors, 2 warnings (MSC529 and ROL517), and 0 skipped checks.
- All 43 pre-existing regression tests still pass. The end-to-end audit exposes behavior those generator-focused tests do not cover.

## Confirmed bugs

| Priority | Finding | Example |
|---|---|---|
| P1 | Source-text placement violates the DTD | The repair appends ce:source-text after a trailing ce:note. It must belong before the note. DTD-valid input becomes DTD-invalid output. |
| P1 | Paired omission markers become malformed XML | The original-form restoration substitutes only the opening tag for a valid paired empty element. Closing tags disappear and the result is not well-formed. |
| P1 | DOI migration deletes electronic-host metadata | The whole electronic host is deleted when its DOI is migrated. Version 2.1, publication date 2020 and access date 5 Oct 2025 are lost before source-text generation. |
| P1 | DOI migration truncates encoded DOI suffixes | 10.1234/a%28b%29 is captured as 10.1234/a. Both the repaired reference and generated source text contain the truncated identifier. |
| P1 | DOI migration creates an invalid second ce:doi | The target host already contains a DOI. Migration appends another ce:doi although its DTD model permits only one. |
| P1 | Multiple structured references receive the wrong source text | With Book and Book B as two sb:reference children, the repair formats only Book and appends its text after Book B. DTD and VTool accept the output despite the wrong association. |
| P1 | Existing CDATA source text is changed | Literal <token></token> text becomes Literal  text. The regex cleanup edits text inside CDATA despite the existing-source preservation rule. VTool additionally flags the new double space as XML503c. |
| P1 | Comma normalization changes URLs | https://example.org/a,,b becomes https://example.org/a,b. The resulting URL is different; VTool does not detect the semantic change. |
| P2 | Explicit inline spacing joins words | High<ce:hsp sp="1.0"/>quality evidence becomes Highquality evidence. Formatting removal loses a semantic space. |
| P2 | Source-text problems are missed by the scanner | The scanner reports VALID for empty source text, required IDs that are missing, and duplicate source-text IDs. Missing IDs are corrected later, but empty content and duplicates remain. VTool reports EMC501, parser and IDS503a. |
| P2 | The UI claims schema verification without validating the schema | The final toast says XML schema verified: All references conform to standard DTD with no modifications needed even when validation fails or the entity scanner reports an error. |

## Additional edge cases and validation distinctions

- Named entities: &alpha; is DTD-valid but the isolated browser parser cannot resolve the external DTD. The scanner calls the block malformed and generation is skipped. VTool rejects named and numerical entities under XML510, so this is a DTD-versus-production normalization limitation, not a production-valid input. Numeric entities are resolved to literal Unicode by repair and the repaired control passes VTool.
- Local MathML namespace: repair removes the explicit xmlns:mml declaration. The repaired fragment fails a standalone browser parse. Full article DTD/VTool parsing accepts it because the DTD supplies the namespace default. This is a portability issue, not a VTool-invalid output. The corrected test includes the required altimg attribute.
- DOI display punctuation: a display label ending in a period and an href without that period produce https://doi.org/10.1234/abc. (https://doi.org/10.1234/abc). Both values are supplied; the output is redundant. Any fix must distinguish display punctuation from punctuation genuinely belonging to a DOI.
- Entity escaping and ordinary inline text controls worked: ampersands, less-than signs, Unicode numeric references, spaced italic words, and query-string ampersands remain represented correctly in generated plain text.

## Native validation evidence

Inputs intentionally omit source text where generation is being tested. VTool MSC543 on those inputs is the expected missing-source production error; it does not make the DTD test structure invalid. Empty/duplicate/missing-ID cases intentionally exercise invalid production input. DTD/VTool acceptance does not establish that a generated citation preserves all content.

| Case | Input DTD | Output DTD | Input VTool errors | Output VTool errors | Output additional codes |
|---|---|---|---:|---:|---|
| existing-empty | Pass | Pass | 1 | 1 | EMC501 |
| existing-whitespace-no-id | Fail | Pass | 3 | 0 |  |
| existing-missing-id | Fail | Pass | 1 | 0 |  |
| duplicate-source-id | Fail | Fail | 2 | 2 | IDS503a, parser |
| multiple-reference-children | Pass | Pass | 1 | 0 |  |
| trailing-note | Pass | Fail | 1 | 1 | parser |
| named-entity | Pass | Pass | 2 | 2 | MSC543, XML510 |
| numeric-entity-control | Pass | Pass | 2 | 0 |  |
| special-character-control | Pass | Pass | 1 | 0 | TTS502 |
| inline-space | Pass | Pass | 1 | 0 |  |
| inline-formatting-control | Pass | Pass | 1 | 0 |  |
| cdata-existing-source | Pass | Pass | 0 | 1 | XML503c |
| comma-url | Pass | Pass | 1 | 0 |  |
| paired-et-al | Pass | Fail | 1 | 3 | (unclassified), parser, Exception |
| paired-ellipsis | Pass | Fail | 1 | 3 | parser, (unclassified), Exception |
| local-math-namespace | Pass | Pass | 1 | 0 |  |
| doi-migration-loses-metadata | Pass | Pass | 1 | 0 |  |
| doi-migration-duplicate-doi | Pass | Fail | 1 | 1 | parser |
| doi-migration-percent-suffix | Pass | Pass | 1 | 0 |  |
| doi-display-punctuation | Pass | Pass | 1 | 0 |  |
| url-query-control | Pass | Pass | 1 | 0 |  |

All native runs reported 0 skipped checks. Raw logs, browser inputs/outputs, and DTD diagnostics are saved beside this report. One native run initially produced an incomplete XML log; it was rerun sequentially and the saved final log parsed successfully.

## Recommended order

1. Fix marker restoration and source-text placement, which can produce structurally invalid output.
2. Make DOI migration preserve host data and complete identifiers, and respect an existing target DOI.
3. Handle every structured reference and preserve its source-text association.
4. Protect CDATA, URL punctuation, and explicit inline spacing from global cleanup.
5. Improve source-text auditing and replace unsupported schema-verification claims.

Generator SHA-256: e1669b3fa750b17e696986f980306712d1225bcaa47446bda36b662fe95d48b3
Native temporary test directory: C:\Users\Kevin\AppData\Local\Temp\source-text-edge-native-j956r5fu
