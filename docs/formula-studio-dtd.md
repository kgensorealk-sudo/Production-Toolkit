# Formula Studio: Elsevier DTD validation

Formula Studio automatically uses **Elsevier CE article DTD 5.7**. There is no version picker or selection step. Copy/download remains guarded by the 5.7 formula checks. Internal helpers and source-profile regressions also retain 5.6 coverage. XML syntax and a correct browser preview do not establish DTD validity.

## What is enforced

`utils/formulaDtd.ts` validates the formula fragment against generated rules for the CE 5.7 article DTD:

- Declared element names and namespaces, child sequences/alternatives/cardinality, mixed text, and EMPTY elements.
- Declared attributes, required/fixed values, enumerations, XML-name/token types, and duplicate IDs within the fragment.
- Only declared, trusted DTD character entities are expanded, using numeric character references. CDATA, comments, and escaped entity-like text are preserved. Arbitrary DTD/entity declarations and external entity loading are not enabled.
- Export requires one `ce:display`, `ce:formula`, or MathML `math` root and an actual MathML formula. Equivalent MathML prefixes/default namespaces are normalized to `mml:`; CE namespaces are normalized to `ce:` for the lexical names used by the DTD.

Invalid formulas stay editable, with issues shown in the UI. Copy and Download remain disabled until formula checks pass. Copy exports a canonical fragment; Download adds its XML declaration and required namespaces. The original input is not silently rewritten to remove errors.

The fence editor uses the CE 5.7 profile's attribute declarations and rejects invalid attributes/enumerations on Apply. For example, `mml:mfenced` allows `open`, `close`, `separators`, and `mathcolor`, but **does not declare `mathsize`** in either bundled CE version. Use a suitable declared container such as `mml:mstyle` when applying inherited size formatting; do not invent attributes on the fence.

## Source/provenance

- CE 5.6: `output/word-scanner-dtd/dtd/art560.dtd` and its modules, including `common160.ent`.
- CE 5.7: `output/word-scanner-dtd/dtd/art570.dtd` and its modules, including `common170.ent`.
- Generated file: `utils/formulaDtdProfiles.json`. It contains 432 declarations for 5.6 and 437 for 5.7, interned full content models, attribute constraints, character-entity mappings, and source SHA-256 fingerprints.

The generator encodes QName prefixes in a temporary copy before reading libxml2's content-model API, which otherwise discards those prefixes. It verifies that generated declaration names match the original DTD. The original DTD modules are never modified. Native cross-checks use those unmodified sources.

CE source notices attribute Elsevier B.V., CC BY 4.0. Included MathML modules carry W3C notices (MIT, INRIA, Keio, Beihang); retain original module notices when redistributing the source distributions. The generated file retains attribution and source fingerprints.

Regenerate intentionally from the complete trusted local distribution:

```text
python scripts/build_formula_dtd_profiles.py PATH_TO_COMPLETE_DTD_DIRECTORY utils/formulaDtdProfiles.json
```

The source distribution must include its referenced modules. Runtime validation uses bundled data and does not fetch DTDs from the network or require Python.

## Independent native verification

```text
node --import tsx tests/formula-dtd.mjs
python scripts/validate_formula_dtd.py PRINTED_NATIVE_CASES_JSON PATH_TO_COMPLETE_DTD_DIRECTORY RESULTS_JSON
```

The portable test prints the location of a temporary cases file outside the repository. The Python harness requires lxml and loads the selected full local article DTD with network fetching disabled. Only its synthetic root is declared ANY; descendants retain their original Elsevier declarations. Canonical namespace bindings are supplied by the harness root, as they would be by an article ancestor.

Verification on 2026-10-30:

- 78 DTD/version cases plus export and reference-context assertions passed in the portable test.
- All 72 canonical positive/negative cases matched native DTD validation. Malformed/declaration/namespace inputs rejected before canonicalization are not counted as native passes.
- Native results: `output/formula-dtd/native-results-20261030.json`.
- Existing 37 Formula Studio editing regressions passed.
- Earlier Chromium checks covered explicit-version gating (since replaced with automatic 5.7), presets, invalid fraction export blocking, fence attribute enforcement, valid fence editing, CE 5.7-only content rejected under 5.6, canonical downloads, and unresolved-reference warnings.

## Scope and downstream checks

The runtime label is **DTD-derived formula checks passed**, not full article validation. The browser checker is not a general-purpose native DTD engine. Native regression results establish agreement on the tested cases, not a fresh native run for every formula a user enters.

References to IDs outside the fragment and attributes requiring article entity declarations are shown as **article-context checks**, not silently passed. After insertion, the destination-article owner must still validate its actual root/DOCTYPE against the intended complete DTD, confirm legal insertion location and document-wide IDs/references, and apply journal/editorial rules. Those checks are not performed by this fragment editor.

The browser preview supports a subset of MathML rendering. DTD validity does not prove that every valid construct is completely rendered. Check the exported source and final typeset result independently.
