# CE snippet generation and validation

The **MS Word Rich Text to CE XML Scanner** tags selected editorial content. It generates fragments for insertion into an existing article; a complete article is not required as input.

## Output contract

- Inline mode retains text and supported inline formatting for insertion into an existing paragraph.
- General paragraph wrapping controls uncaptured input only.
- Highlights always use `ce:abstract` with `class="author-highlights"`, an abstract section, a simple paragraph, and a list whose items contain paragraphs.
- Acknowledgements, conflicts of interest, data availability and article sections always contain their required paragraphs, regardless of the general wrapping option.
- Abstracts contain abstract sections and simple paragraphs. Appendices contain sections inside `ce:appendices`; the scanner does not invent a `ce:appendix` element.
- JEL blocks keep separate paragraph/line values as separate keywords.
- Required IDs are generated even when optional IDs are disabled. Allocation checks duplicate IDs within the output and does not silently exceed the configured four-digit range.
- “Captured sections only” excludes surrounding input from the output while retaining it in the editor. “All input” preserves the broader pasted content.
- Text, formatting and list order are preserved for supported inputs. Unsupported objects, overlapping captures, nested tables and invalid spans block output with an explanation rather than silently discarding content.

## Target DTD profiles

The user can select CE article DTD 5.7 or 5.6. Bundled rules in `utils/wordScannerCe570.json` and `utils/wordScannerCe560.json` describe the 32 element types the scanner generates. They are derived from the complete article DTD and common element pool, including expanded content models, required/fixed attributes and enumerations.

`utils/wordScannerDtd.ts` checks every generated subtree, element namespace, child order, mixed-content membership, attributes and output-local IDs before offering XML to copy. Failed checks clear the prior output and disable copying/downloading. The UI reports snippet checks, not complete article validation.

Regenerate a profile from a complete, locally supplied DTD distribution:

```text
python scripts/build_word_scanner_dtd_profile.py PATH_TO_DTD/art570.dtd utils/wordScannerCe570.json
python scripts/build_word_scanner_dtd_profile.py PATH_TO_DTD/art560.dtd utils/wordScannerCe560.json
```

The generator requires lxml and records source filenames and SHA-256 hashes. All referenced DTD modules must be present. It makes no changes to the source DTD distribution.

The source article DTDs and common element pools carry a CC BY 4.0 notice, copyright Elsevier B.V. (article: 1993–2023; common pool: 2002–2025 for the 1.7 pool used here). The derived profiles retain attribution and the license link: https://creativecommons.org/licenses/by/4.0/. The tool's visible name and branding use CE XML.

## Independent validation without a full article

Maintained regressions:

```text
node tests/word-to-xml-safety.mjs
```

The test exports `generatedCases` for an external validation harness. Save those cases to JSON, then run:

```text
python scripts/validate_word_scanner_dtd.py CASES_JSON PATH_TO_COMPLETE_DTD_DIRECTORY RESULTS_JSON
```

The native harness loads the **complete, unmodified article DTD** using libxml2/lxml. A synthetic `scanner-root` permits multiple snippet roots and text, while all generated CE/CALS elements and descendants retain their original DTD declarations. Negative controls verify that bare acknowledgement/list-item text, incorrect abstract wrappers, invented elements, invalid attributes, missing required IDs and duplicate IDs are rejected.

This proves subtree structure independently of the browser rule checker. It does not check where a fragment belongs in a particular article, collisions with IDs already present there, or journal-specific production rules. Those context checks occur after insertion; they do not require uploading the article to this scanner.

## Browser handling

The rich-text view removes executable HTML attributes and active embedded content from source-mode rendering/pasted HTML while preserving supported editorial formatting and Word list metadata. Clipboard failures are reported accurately and leave Raw Text available. Conversion and bundled profile checks do not depend on a conversion server or database.
