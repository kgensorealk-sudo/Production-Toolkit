# Source-text validation — 7 October 2026

Implemented preservation of translated titles/subtitles, conference details, all supplied publication/access dates, version text, ISBN/ISSN, article numbers, alternative author/editor names, and title punctuation.

## Validation method

- Tested the actual TypeScript generator with 43 regression tests, including 13 fixed-output fixtures.
- Validated all 13 generated reference/source-text pairs against ce-bib-reference170.dtd extracted from the installed VTool jar.
- Inserted each pair into a separate temporary copy of a production article, preserving its bibliography ID and label; the original article was not modified.
- Ran Elsevier VTool 5.98.2 (checks 2.98.2) on the unchanged baseline and each complete test article with -forcecheck -nofp.
- Compared report totals and warning IDs/messages with the baseline.

Baseline: 0 errors, 2 warnings, 0 skipped checks. Existing warnings: MSC529 (grant-sponsor ID) and ROL517 (role attribute).

## Results

| Case | Reference DTD | VTool errors | Warnings | Skipped | Outcome |
|---|---|---:|---:|---:|---|
| translated-title | Pass | 0 | 2 | 0 | Pass |
| translation-only | Pass | 0 | 2 | 0 | Pass |
| conference | Pass | 0 | 2 | 0 | Pass |
| multiple-publication-dates | Pass | 0 | 2 | 0 | Pass |
| multiple-access-dates | Pass | 0 | 2 | 0 | Pass |
| version | Pass | 0 | 2 | 0 | Pass |
| identifiers | Pass | 0 | 2 | 0 | Pass |
| pages-and-article-number | Pass | 1 | 2 | 0 | Expected rejection: STR507 |
| author-alt-name | Pass | 0 | 2 | 0 | Pass |
| title-question | Pass | 0 | 2 | 0 | Pass |
| editor-alt-name | Pass | 0 | 2 | 0 | Pass |
| title-exclamation | Pass | 0 | 2 | 0 | Pass |
| article-number-only | Pass | 0 | 2 | 0 | Pass |

12 positive cases passed VTool with no errors or skipped checks. One negative case was rejected as expected.

## DTD versus production rules

The DTD permits both sb:pages and sb:article-number in one sb:host, but VTool rejects that combination with STR507. This is retained as a negative test, not a valid production reference. The source-text generator represents both supplied values without changing the reference XML.

Initial synthetic ISBN/ISSN values failed VTool checksum checks (IDN511a/IDN511b); the positive fixtures now use checksum-valid 978-0-306-40615-7 and 0378-5955.

The DTD and VTool validate structure and production rules; exact-output regression tests verify that supplied values appear in generated text.

Generator SHA-256: e1669b3fa750b17e696986f980306712d1225bcaa47446bda36b662fe95d48b3

Native VTool XML logs are stored beside this report. Temporary test article directory: C:\Users\Kevin\AppData\Local\Temp\source-text-vtool-vtr5gi3x
