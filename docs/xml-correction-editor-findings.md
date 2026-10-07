# XML Correction Editor: production reference

Inspected on 2026-10-07: the running Straive XML Corrections Editor - Elsevier executable, file/product version 2.27.0.0. Installation files were read without changing the open production article.

## Evidence and scope

The ClickOnce installation contains `Supporting_Files/DTD/art570.dtd`, `common170.ent`, a DTD catalog, `Supporting_Files/Parser/xmlvalid.exe`, VTool components, and `IDvaildation.xml` (spelling as distributed).

The parser identifies itself as XML Validator using Celios 1.0.1. Its batch wrapper invokes a supplied executable with `--dtd`, `-w`, an input path, and a redirected report. This establishes a bundled DTD validation capability; it does not establish which checks the editor UI runs at each action.

The DTD files are not byte-identical to the previously inspected Vtool distribution. Verify the relevant declarations in the actual production bundle rather than relying solely on filenames or version labels.

## Validator probes

Ran the bundled `xmlvalid.exe --dtd=<installed art570.dtd> <temporary sample>` on six isolated reference fragments. Each fragment uses a `ce:bib-reference` root, a label followed by `ce:other-ref/ce:textref`, and where applicable a citation inside that text. These probes validate the reference fragment against the real declarations, not the placement of references in a complete article.

| Case | Result |
| --- | --- |
| `ce:label/ce:italic` containing 9, with a self-closing citation to the reference ID | Valid, exit 0 |
| Same citation with separate opening and closing tags and no content | Valid, exit 0 |
| `id="style1"` on `ce:italic` | Undeclared attribute, exit 2 |
| Citation target absent from the document | Unresolved IDREF, exit 2 |
| Reference ID `A` instead of a `bb` prefix | Valid, exit 0 |
| Bibliography reference without its direct label | Invalid content: label expected first, exit 2 |

`common170.ent` declares both citation elements with `( %text.data; )*`, allowing empty content. A single citation requires an IDREF; a grouped citation requires IDREFS. Bibliography references require an ID and a first direct label. The formatting declarations allow more wrappers than XMLRenumber currently supports, including monospace, sans-serif, and small caps. DTD permission does not prove that stripping or rewriting any particular wrapper is safe.

`IDvaildation.xml` records `bb` for `ce_bib-reference`, `cf` for `ce_cross-ref` and `ce_cross-refs`, and `rf` for `sb_reference`. These are production naming conventions separate from the DTD's ID type. The isolated validator accepting `A` confirms that distinction; enforcement and severity in the editor UI have not been observed.

## Guidance for XMLRenumber

- Verify future test structures against the production DTD, including valid reference content and resolvable IDs. Deliberately invalid tests must say what rule they violate.
- Treat self-closing and paired empty citations consistently when they target processable bibliography references. Keep non-bibliographic links outside renumbering scope.
- Preserve reference IDs and citation target attributes. Do not rename IDs to match a prefix convention during number updates.
- Keep DTD errors, production naming warnings, and renumbering limitations distinct. A JSON profile remains a selected-rule mapping, not complete DTD validation.
- Preserve supported label/citation formatting by default. A DTD-valid wrapper unsupported by the engine should receive a preservation/review message, not a claim that its markup is invalid.
- Retain page locators and entity spelling where safe. Verify full-document validity with a separate production validator after renumbering.

No production application behavior beyond the isolated validator has been tested. No application binaries, settings, production XML, or renumbering logic were changed by this investigation.

## VTool production check follow-up

Ran the separate supplied VTool 5.98.2 (checks 2.98.2) on a temporary copy of the previously supplied article, replacing one bibliography citation in a table entry with self-closing and paired empty citations to the same existing bibliography ID. Both produced error `EMC502`: "Element 'ce:cross-ref' may not have empty content in this situation." Both also produced `IDS508` because these test citations lacked their own `id` attributes. The article had other unrelated validation findings; this was not a clean full-article acceptance test.

Therefore empty bibliography citations in the tested context are DTD-valid but rejected by VTool's additional production checks. Do not describe these forms as production-acceptable on the basis of the DTD test alone. The message is context-sensitive; no claim is made about every possible cross-reference context. `IDS508` also demonstrates a production requirement beyond the DTD's optional citation ID in this context. Reports and modified samples remain in a temporary folder outside the repository; the supplied article was not changed.
