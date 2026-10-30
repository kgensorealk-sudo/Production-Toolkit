# Formula Studio Pro fixes — 2026-10-29

Formula Studio renders editable MathML from XML, then writes symbol and metadata edits back to the source. This flow runs in the browser and has no API or database dependency.

## Changes

- Construct a MathML namespace tree for preview instead of parsing formula XML as HTML. Preserve fractions, scripts, font attributes, and native token spacing.
- Expand legacy `mfenced` elements only in the preview. Generated fences and separators are not editable source tokens.
- Use the same source token indexes for preview and editing, retaining empty token positions so clearing a value cannot shift a later selection. Structural operations, insertion, deletion, and text edits affect one occurrence, including repeated symbols and unprefixed MathML.
- Reject malformed XML and stale token selections instead of applying global regular expression replacements.
- Update formula metadata through the XML DOM, preserving unrelated IDs, attributed display wrappers, and escaped attribute values.
- Parse supported TeX groups recursively, including nested fractions, square roots, sub/superscripts, common operators, and text. Unsupported or incomplete input reports an error without replacing the current formula. This is a limited quick importer, not a complete TeX engine.
- Clear stale selections after XML changes and undo/redo. Keep native undo behavior in other text inputs. Report clipboard failures.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed; existing bundle-size and Browserslist-age warnings remain.
- `node --import tsx tests/formula-studio.mjs`: 37 behavioral regression checks passed. Registered in `tests/test-manifest.json`.
- The full test runner was not run. The original working folder had two unclassified Keeper tests: `keeper-author-name-correction-dashboard.mjs` and `keeper-author-name-correction.mjs`. The latest remote main also has an unclassified `subscriptionAccess.test.mjs`. Formula Studio checks ran independently.
- Chromium: all five built-in presets rendered with native MathML namespaces and nonzero layout dimensions. Inspected fenced-expression and mobile quadratic screenshots.
- Chromium: single-occurrence wrap, undo/redo, preservation of child and display IDs, nested TeX import, unsupported TeX preserving source, invalid XML rejection, and unprefixed MathML passed.
- Chromium: clearing a canvas symbol and typing a replacement keeps the editor active, changes only the selected occurrence, and synchronizes the token text inputs.

Browser checks mounted the actual page component in a local Vite fixture at `output/playwright/formula-studio/`. They did not exercise the application's sign-in/access gates or a deployed site. Screenshots and the browser verification scripts are in that folder.

## Usability update

- Reduced the main toolbar to undo/redo, LaTeX import, XML file import, download, and copy. Formatting controls stay next to the XML editor.
- Replaced the large warning with a short publication check, collapsed help by default, and put examples in a labeled picker.
- Added collapsible structure insertion and symbol editors so the formula and XML remain easy to reach.
- Renamed view controls to Preview + XML, Preview, and XML, with announced selection state. Added visible keyboard focus and larger button targets.
- Added inline LaTeX errors, Enter to import, XML syntax feedback, expandable parser details, and disabled downloads for invalid XML.
- Added XML/MathML file import (up to 2 MB) and XML download with a filename based on the formula ID. Import, examples, and edits remain undoable.
- Chromium checks passed for the example picker, help disclosure, collapsed advanced controls, LaTeX feedback, Enter to import, XML file import/download, and invalid-XML download blocking. Desktop and 390 px mobile screenshots are saved with the browser artifacts.

## Follow-up audit fixes

All four bugs in the follow-up audit have been fixed:

- Preview and editor now share the visible-token traversal for the first formula. Annotation payloads and unsupported subtrees cannot shift selection indexes or receive edits intended for visible symbols.
- Format/Compact XML use the XML DOM and preserve token text, multiline text, CDATA, annotation payloads, mixed content, and `xml:space="preserve"` subtrees. Compaction removes layout whitespace; meaningful line breaks remain.
- Downloads serialize a standalone XML document with required namespace declarations and a UTF-8 declaration. Multiple root fragments report an error instead of downloading an invalid document.
- Metadata resets when an imported formula has no ID. Assigning an ID to bare MathML creates a `ce:formula` wrapper while preserving IDs on the math and its symbols.

Seven additional regression checks cover these cases. Chromium checks also passed for visible-symbol edits with hidden annotations, both formatting buttons preserving text, stale-ID clearing, assigning an ID to bare MathML, and parsing the actual downloaded bytes as standalone XML. The browser script is `output/playwright/formula-studio/verify-four-bugfixes.js`.

## Additional audit fixes

- Palette insertion now appends through the XML DOM, supporting alternate prefixes, default namespaces, and empty/self-closing math roots. Missing math roots produce an error without changing the source.
- Adding a token beside a fraction or script operand wraps the original and new tokens in an `mrow`, retaining the operand's position. Deleting a direct operand is blocked with guidance to edit or clear its value. Ordinary row insertion/deletion still works.
- LaTeX import reads complete Unicode code points. Mathematical letters such as `𝑥` no longer become invalid surrogate fragments. Split controls also count complete code points.
- Fence expansion preserves formatting attributes, XML attributes, prefixes, and namespaces. Nested fences, empty delimiters, and Unicode separator characters are preserved.

Seven additional regression checks exercise these fixes, including every operand position of the fraction and supported script structures. Chromium checks passed for alternate-prefix and empty-root insertion, fraction grouping, blocked denominator deletion, Unicode LaTeX import, and fence formatting preservation. The script is `output/playwright/formula-studio/verify-additional-fixes.js`.

## Rendered-view editing fixes

- Clearing a symbol commits immediately and retains its position in the preview/editor index. Blur no longer mutates the formula or cancels the next click. A quick symbol fills the cleared position, and selecting another symbol works on the first click.
- Quick-symbol buttons create separate correctly typed tokens: Greek letters use `mi`; operators such as integrals use `mo`. A nonempty selection gets a new adjacent token, grouped within the original operand when necessary. An empty selection is replaced, preserving its ID.
- Whitespace is normalized only for selection identity checks. The actual XML text remains unchanged, so wrapping a symbol edited to `" x "` succeeds while preserving its spaces.

Four additional regression checks cover stable empty-token indexes, quick-symbol types, operand-safe insertion/replacement, and whitespace selection checks. Chromium confirmed all three reported bugs are fixed in rendered-only mode, with repeated-symbol editing and undo/redo still working. The script is `output/playwright/formula-studio/verify-rendered-edit-fixes.js`.

## Rendered-view keyboard, text, and spacing fixes

- Symbol selection retains exact source text, including surrounding spaces and line breaks. Textareas support multiline values in the selected-symbol and advanced editors.
- Selecting a different symbol focuses its editor so typing can continue immediately. Re-selecting the same canvas symbol restores focus too.
- Live formula editors route Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z through formula history. Other text inputs keep their native undo behavior.
- Spacing nodes expose a labeled width editor with an Apply action and validation. Width edits preserve height/depth and keep `mspace` empty. The generic text-edit helper rejects spacing elements, and the advanced symbol list offers an Edit spacing button.

Four additional regression checks cover exact text preservation, spacing text rejection, attribute/operand preservation, and width validation/repair. Chromium also passed the reported whitespace, focus-switching, and keyboard undo/redo workflows, plus invalid-width feedback and applying a valid space width. The script is `output/playwright/formula-studio/verify-rendered-round2-fixes.js`.

## Rendered mfenced attribute editor — 2026-10-30

- Clicking a generated bracket or separator now selects the original `mfenced` element. Source identity is preserved for nested fences without changing symbol indexes or exposing hidden annotation content.
- The fence editor supports opening/closing brackets and separators, including explicit empty values. Existing attributes can be edited or removed; additional attributes such as `mathsize`, `mathcolor`, and `xml:lang` can be added.
- An Edit fence picker provides keyboard access and allows selection when delimiters are empty. Clicking an actual symbol still opens the symbol editor.
- Apply updates the original `mfenced` XML without expanding its source structure. Undo/redo restores attribute changes. Invalid attribute names and undeclared prefixes are rejected; namespace declarations remain managed automatically.

Five regression checks cover nested identity, isolated attribute updates, empty delimiters/removal, safe escaping/namespaces, and hidden annotations. Chromium passed bracket selection, common and additional attribute changes, undo/redo, hidden-fence selection, symbol editing, and a 390 px mobile layout. Script: `output/playwright/formula-studio/verify-fence-attribute-editor.js`.

## DTD-aware export — 2026-10-30

Formula Studio now requires explicit CE article 5.6/5.7 selection and blocks Copy/Download when the selected DTD's formula rules fail. The fence editor enforces declared attributes. Export canonicalizes CE/MathML prefixes, and safe declared character entities are supported. See [the validation contract and downstream limits](formula-studio-dtd.md) for sources, native verification, and remaining article-context checks.

Validation: 78 DTD cases, 72 matching native DTD cases, and the existing 37 editing checks. Chromium checked export gating, version-specific rules, fence enforcement, canonical downloads, and external-reference warnings.

Per the operator's subsequent instruction, the UI now automatically targets CE 5.7. The version picker and initial selection gate have been removed; 5.7 validation still guards copying, downloading, and fence attributes. Internal 5.6 profiles remain available for regression/source comparison.
