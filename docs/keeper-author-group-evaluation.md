# Keeper Evaluation — D-KEEPER-EVAL-001

Local implementation for independent review. Passing tests do not constitute owner ratification, production Quality Check or manuscript sign-off.

## Boundary

Keeper → Evaluation enables Overview and Author-group only. It uses existing slate/indigo styling, accessible keyboard tabs, expandable escaped evidence and the existing Elsevier lexical scanner. The dashboard owns a separate transient XML upload and optional instructions; it does not use or change a selected Workbench task. Leaving the Evaluation panel, clearing it, or changing owner removes its transient inputs/results. Evaluation does not call a provider, open IndexedDB, write manuscript XML, create review tasks, run corrections, or produce authorization/verification receipts.

Exactly nine source files comprise this feature:

- New: `utils/keeperAuthorGroupEvaluation.ts`
- New: `utils/keeperAuthorGroupEvaluation.worker.ts`
- New: `components/KeeperEvaluationDashboard.tsx`
- Modified: `pages/Keeper.tsx`
- New: `tests/keeper-author-group-evaluation.mjs`
- New: `tests/keeper-author-group-dashboard.mjs`
- New: `tests/keeper-author-group-real-case.mjs`
- Modified: `tests/test-manifest.json`
- New: `docs/keeper-author-group-evaluation.md`

The B-2c storage investigation remains planning only; no migration, storage namespace, frozen contract change or execution pipeline is included.

## Source and evidence

The upload is limited to 4,000,000 bytes and UTF-8 (BOM permitted). The worker hashes the actual uploaded bytes using SHA-256, then decodes with fatal UTF-8 and BOM preservation. Instructions have their own SHA-256 over their exact UTF-8 text. Results include source filename, byte count and both hashes. These are input fingerprints, not trusted historical or execution receipts. Text spans use UTF-16 half-open offsets into the decoded XML/instructions, plus one-based line/column. Excerpts over 1,200 units are visibly shortened; full span bounds remain available.

Source/instruction edits immediately invalidate results, terminate a pending worker and advance its request generation. Results must match both the current worker instance and request generation. Clear, timeout, crash, owner change and unmount also cancel work. The worker deadline is 20 seconds; the evaluator additionally checks a 15-second work budget. Limits: 20,000 nodes, depth 64, 500 authors, 200 findings, 2,000 evidence captures, 20,000 instruction code units. Limit failures yield INCOMPLETE and preserve previously found HOLD reasons and observed corrections. Counts from incomplete evaluation are explicitly observed lower bounds, not confirmed totals.

## Supported profile and checks

This is a bounded Elsevier lexical `article` evaluator, not namespace, DTD, VTOOL or whole-manuscript validation. Existing scanner handling of undeclared lexical `ce:` prefixes and external DTD context is preserved. No external resources are fetched. An explicitly declared `ce` namespace must be `http://www.elsevier.com/xml/common/dtd`; default namespaces and conflicting mappings are outside this profile. A single article root is required. Unknown encodings, malformed XML, unsupported profile structures and resource failures cannot PASS.

Front-matter author groups must be under article, head or another front-matter author group. Body/section/tail/bibliography groups and bibliography authors are excluded. Author order is the order of current author elements; no claim is made that it matches an unavailable earlier version or editorially intended order. Active name text excludes OPT deletions and comments and includes insertions; supplied before-text excludes insertions and retains deletions. Names are compared conservatively with Unicode NFC and whitespace normalization; there is no fuzzy identity merge or transliteration.

Checks include:

- One nonempty current given-name and surname; `id` and `author-id` presence/lexical form and uniqueness. Identical names across authors require disambiguation rather than automatic merging. Collective/anonymous authors and unsupported name structures receive explicit findings.
- Present indexed-name surname and given-name initials, including compound surnames and hyphenated initials. Absent indexed-name is NOT_APPLICABLE. Multiple indexed names or mismatches HOLD.
- `ce:cross-ref`/`ce:cross-refs` refid tokens and local href fragments. Each relevant ID must resolve to one active owner of a supported type. Affiliation/correspondence targets must be within the author's group or an ancestor group; ordinary footnotes/biographies are permitted. Missing, duplicate, wrong-type or out-of-scope targets HOLD. Target labels alone do not establish content. Other unrecognized author reference forms are not claimed as validated.
- Corresponding authors need linked correspondence and an owned plausible email. A unique correspondence note may supply an email; a shared note cannot establish ownership without author-owned emails. Mailto/text mismatches HOLD. Email deliverability is not evaluated.
- Separate CRediT statements headed CRediT/authorship contribution: supported bold `Name:` segments or structured `ce:author` given-name/surname records must match current identities. Unknown/duplicate/missing names HOLD. Unsupported/mixed statements and unparsed name boundaries are INCOMPLETE. Author-attached contributor-role elements do not create independent name references. Role taxonomy is outside scope.
- Supplied name correction evidence, including relevant OPT comments throughout the article outside bibliography and explicit instructions. Unrelated OPT body/reference changes do not become author-name changes.

## Correction semantics

An independently verified visible substitution requires exactly one insertion and one deletion in a current given-name or surname field (or one unambiguous whole-field insertion/deletion pair), with nonempty different normalized before/after values and no nested conflicting OPT pair. It verifies only that change as represented in supplied XML; it does not prove who performed it, when, or that the supplied history is exhaustive. One-sided/multiple competing pairs and whole-author additions/removals require review; whole-author identity/order changes are not automatically reconstructed.

Explicit instruction format:

```text
Author au0005: replace "Old surname" with "New surname"
```

Equivalent repeated instructions are one correction. A matching before/after OPT field coalesces that instruction with its XML evidence. An instruction alone—even if its requested result matches current text—does not independently prove application. Relevant unsupported prose remains unresolved evidence and HOLD; supplied instruction material that cannot be bound to the supported author-correction form is INCOMPLETE. Potentially relevant comments use name/identity and correction wording; this deterministic detector does not claim natural-language completeness. Ambiguous relevant material never establishes verified application.

| Field | Meaning |
|---|---|
| AUTHOR_GROUP_INTEGRITY | PASS when applicable supported checks finish without findings; HOLD for confirmed defects/material ambiguities; INCOMPLETE if supported evaluation cannot finish. All HOLD reasons remain visible under INCOMPLETE. |
| AUTHOR_NAME_CORRECTIONS_FOUND | Distinct evidenced correction items; unresolved items are labeled, with no invented before/after. |
| AUTHOR_NAME_CHANGES_ALREADY_PRESENT | Changes independently verified from supplied before/after evidence as incorporated in the current active XML. |
| AUTHOR_NAME_CHANGES_APPLIED | Always **0**. Keeper executes no changes in this milestone. |
| AUTHOR_NAME_HISTORY | VERIFIED only for the explicitly described supplied OPT changes when every observed correction is independently bound and verified; otherwise NOT_DETERMINABLE. No publication-wide historical completeness claim. |
| AUTHOR_GROUP_HOLD | NONE or specific reasons, with findings/evidence retained even under INCOMPLETE. |
| MANUAL_AUTHOR_GROUP_REVIEW | REQUIRED for HOLD/INCOMPLETE; NOT_REQUIRED for a passing current group. Missing history alone does not require routine review. No review task is created. |

Zero observed/verified changes does not mean no author names ever changed. Overview states that other article domains and final Quality Check have not been evaluated.

## Verification commands

Use the existing Node 24 runtime/toolchain:

```powershell
node --import tsx tests/keeper-author-group-evaluation.mjs
node --import tsx tests/keeper-author-group-dashboard.mjs
$env:KEEPER_AUTHOR_GROUP_FIXTURE='C:/path/to/CEJ_183175.xml'
node --import tsx tests/keeper-author-group-real-case.mjs
npm test
npm run lint
npm run build
```

The first two files are portable test entry points. The real-case file is external-only and inventoried under manifest helpers solely to satisfy existing discovery without modifying the runner. Its external-check record documents explicit standalone execution; the existing `npm run test:external` dispatcher does not invoke it. No fixture means UNAVAILABLE, zero executed cases, and exit code 2. Hash mismatch is a failure, never a substitute synthetic PASS.

CEJ_183175 acceptance requires exact SHA-256 `37c11c828d66d30126638ee6be6b20039dde44441bd7afc5beebb03f7e3558e0` (160,576 bytes). Expected current authors: Yan Zhang, Ke Zuo, Changwei Hu, Dianyong Tang, Zhishan Su; two affiliation targets; two corresponding authors with emails; matching separate CRediT; no applicable indexed-name. Expected result: PASS; corrections found/already present/applied all zero; history NOT_DETERMINABLE; HOLD NONE; manual review NOT_REQUIRED. The private fixture is not copied into the repository.

Portable evaluator tests cover synthetic corrections, pending/ambiguous instructions, reference and email ownership, indexed-name/CRediT mismatches, deleted authors, malformed/unsupported XML, entities, Unicode, resource limits and evidence spans. Dashboard tests combine actual worker-handler hashing/evaluation with DOM lifecycle scenarios using a controlled Worker double; they do not by themselves prove browser worker bundling. Real-browser evidence must exercise the actual Vite-bundled worker and upload flow separately. UI evidence may use an isolated render of the actual component to avoid signed-in application/storage activity; such evidence is not represented as authentication or full Toolkit navigation acceptance.

No test result establishes external publisher validation, authorization, correction execution, production readiness or owner ratification. Local evidence logs, screenshots, exact hashes and diff are delivered separately for independent review.
