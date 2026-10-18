# Reference Updater scoring investigation

This is the pre-fix investigation record from 2026-10-18, following View Synchronizer commit `5a013a2`. Reference Updater application code was not changed during that investigation. The subsequent authorized implementation is described in `implementation.md`; `results.json` preserves the pre-fix evidence and `verification-results.json` records the implementation's outcomes. The investigation uses the existing TypeScript-AST harness, which executes the actual parser, analysis, review gate, and merge functions extracted from `pages/ReferenceUpdater.tsx`.

## Conclusion

The percentage is not a consistent measure of visible-text similarity. Confirmed text-extraction defects combine with a staged matching algorithm and several incompatible scoring formulas. Raising scores or lowering thresholds would obscure these defects and could make incorrect matches easier to accept.

There are both false low scores and false exact matches. Some low scores deliberately represent missing evidence; they should not be forced to 100. The fixes should distinguish presentation differences, missing metadata, and contradictory metadata.

## Reproduction and evidence

Run from the repository root:

```powershell
node artifacts/reference-updater-scoring-investigation/investigate.mjs
```

`results.json` contains 22 scenarios with input XML, parsed evidence, scores, matching routes, candidate lists, and default/Auto-Confirm merge outcomes. No approval is simulated for these merge checks. Generated test output stays in memory.

On the repaired code, the command above writes `verification-results.json` without overwriting the historical evidence. `--assert-baseline` is intended only for running the script against the pre-fix application source.

All 25 existing `tests/reference-updater-*.mjs` test entry points (excluding the harness helper) passed during this investigation. Their outputs were directed by the existing test helper to temporary locations outside the repository. Passing those tests does not cover the new failure cases documented here.

The earlier YBCMD production input pair referenced by existing audit scripts is unavailable at its recorded local paths. These are synthetic, reproducible engine tests, not a claim that the user's exact low-scoring reference has been identified. No browser session or publisher DTD validation was performed in this investigation.

## Confirmed findings

### 1. P1: false exact text matches can bypass review

`cleanContent` replaces every XML tag with a space (ReferenceUpdater.tsx:363). Consequently:

```xml
<ce:other-ref>Smith (2020). A<ce:italic>B</ce:italic>C.</ce:other-ref>
<ce:other-ref>Smith (2020). A B C.</ce:other-ref>
```

Both become the same comparison text, despite different visible word boundaries. The result is **Content 100%, status update**, and merge output is produced with the default settings, without review. This directly conflicts with the nearby requirement to retain word boundaries for exact matching.

Conversely, putting inline formatting inside the word `Ecosystems` lowers an otherwise identical visible-text pair to **Label 80%**. Both errors come from the same flattening rule.

### 2. P2: equivalent XML entity and CDATA spellings produce different evidence

The scanner expands many named entities but preserves predefined/numeric XML spellings in the raw metadata string. Reference Updater then derives comparison text and titles by regex rather than by decoded text extraction (lines 354–365).

| Representation-only difference | Observed score / route | Merge without review |
| --- | --- | --- |
| `A &amp; B` versus `A &#38; B`, short entry | 76%, Label | Blocked |
| Same difference, longer entry with journal metadata | 95%, Full-Text | Only with Auto-Confirm |
| Literal `é` versus `&#233;` | 93%, Label | Blocked |
| Escaped ampersand versus equivalent literal CDATA | 56%, Label | Blocked |
| Inline formatting inside an unchanged word | 80%, Label | Blocked |

For the 76% case, the title keys become `aampb` and `a38b`. Their edit similarity is 0.4, giving `40 + 40×0.4 + 20 = 76`. This identifies the cause, rather than merely observing the low score.

Longer references dilute the same encoding error enough to cross the Full-Text threshold (>0.92). That changes the scoring formula and review category. Thus the same type of harmless change can have different operational consequences depending on reference length.

### 3. P2: an early weak label match suppresses a stronger primary candidate

Matching is a sequence of stages, each generally entered only if the previous stage produced no candidates:

1. Exact flattened content: 100.
2. DOI: 100.
3. Full-Text edit similarity >0.92.
4. Descriptive label, scored using metadata.
5. Surname/year or fuzzy fingerprint.
6. Same-number fallback for explicit review.

In the reproduced two-candidate case, a different-title entry with the same descriptive label is assigned **69%, Label** as the primary suggestion. A second entry with the correct title, authors, and year is not considered by the primary Surname-Year stage because the label candidate already exists. The second entry scores **100%, Surname-Year** when tested alone.

The secondary duplicate pass does expose the stronger entry as a separate review row. It is not lost altogether, but the primary suggestion and available candidate list are misleading and require extra reconciliation.

### 4. P1 review-policy gap: Full-Text can skip contradictory metadata checks

The Full-Text stage runs before the complete-author label comparison and Surname-Year checks. The final conflict override explicitly checks DOI disagreement, not author or year disagreement (lines 615–624).

Reproduced with otherwise identical long references:

- Third author `Lee` versus `Brown`: **96%, Full-Text**, smart_match.
- Publication year `2020` versus `2021`: **99%, Full-Text**, smart_match.

Both are blocked under default settings but produce merge output when Auto-Confirm is enabled. A high text score therefore does not establish metadata agreement. These might be intentional corrections; the investigation cannot determine that intent. The observed gap is that Auto-Confirm accepts them without explicitly acknowledging the contradiction.

Genuine differing DOIs still produce a conflict and remain blocked even with Auto-Confirm. Different numeric labels also remain ineligible for replacement. Those protections must remain.

### 5. P2: equivalent DOI strings can produce a false conflict

DOI normalization removes `doi:` without subsequently trimming the remainder (line 361). `10.1234/abc` versus `doi: 10.1234/abc` therefore becomes two different keys. The reproduced pair is **94%, Full-Text, conflict**, despite the equivalent identifier. The common DOI URL form without this extra whitespace correctly produces DOI 100%.

## Percentage semantics and expected low scores

For label matches, the formula is:

```text
40 base + up to 40 for title similarity + 20 for a complete ordered author-list match
```

Missing structured author data supplies no 20-point author bonus. A plain-text reference can therefore score **80%** against an equivalent structured reference even when the titles match exactly. The author extractor for this evidence reads `sb:author` fields; a recognizable name in prose is not equivalent to a verified complete author list.

The same label fallback can score **40%** with no usable title or author evidence. It remains a review candidate, not proof of identity. Conversely, a Label 100% result still requires review. In one control it coexists with only **57.94% flattened full-text similarity**, because one reference includes additional source text. This is intentional evidence weighting but misleading if shown as a generic text-match percentage.

Adding/removing `ce:source-text` changes the flattened comparison text and may duplicate bibliographic information. This does not always lower the displayed score: the structured-metadata control still scores Label 100%. My earlier suggestion to simply exclude source text was too broad. Structured fields and source text should be separate signals, with disagreements retained for review.

## Title extraction: confirmed limitation, constrained production claim

The parser takes the first `ce:title` or `sb:title` anywhere in the reference (line 354), without restricting it to the contribution. Reordering contribution and host makes the selected title change and produces 47% in the test. This confirms order sensitivity in accepted XML. The host-before-contribution test was not validated against a publisher DTD, so it does not establish that this specific order occurs in valid production XML.

Plain-text title extraction is also heuristic: without a parenthesized year, it may include the author and year in the title proxy. A structured/plain comparison reproduces 75%. This should be marked as inferred title evidence rather than treated as a known article title.

## Recommended repair order and acceptance criteria

1. Correct comparison text extraction using parsed nodes. Decode equivalent entity spellings and preserve literal CDATA. Preserve inline word boundaries; introduce field boundaries only where the structure requires them. Exact matches must not collapse `ABC` into `A B C`.
2. Separate structured metadata, source text, and labels. Extract contribution/host titles and contributor roles by scope, and retain evidence provenance. Missing evidence must remain distinct from a contradiction. Do not discard source-text disagreements.
3. Normalize DOI identifiers completely before comparison, including whitespace after recognized prefixes. Keep genuine DOI conflicts review-required.
4. Gather candidate evidence before selecting the primary suggestion. Avoid suppressing stronger candidates merely because a weaker stage found a result. Preserve ambiguity and ownership safeguards; do not simply compare incompatible stage scores as if calibrated probabilities.
5. Apply metadata contradiction checks consistently across matching routes before Auto-Confirm. Treat intentional author/year corrections as explicit review decisions unless an approved product rule states otherwise.
6. Display text similarity and evidence-based match score separately, with clear missing/conflicting-field explanations. A percentage must identify what it measures.

Before merging a repair, promote these reproduction cases to maintained regressions, run the existing Reference Updater suite, and test the actual user input pair in the browser. Include both positive normalization cases and negative collision/conflict controls. Do not change thresholds merely to raise the displayed percentage.
