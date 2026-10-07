# Content normalization fix

Addresses audit bug 2. Exact content keys retain Unicode, punctuation and word boundaries, with NFC normalization. Structured author/title matching fields retain Unicode letters and combining marks. A candidate with a different nonempty DOI is classified as a conflict requiring manual review, including when Auto-Confirm is enabled. Explicit approval still permits a DOI correction.

Verification: six content regression scenarios plus Unicode/punctuation assertions pass, as do all eight numeric-label regression scenarios, TypeScript checking, and diff whitespace checks.

Three original/output fixture pairs (unrelated Chinese references, identical Chinese content, identical Latin content) were inserted into the previously validated full article test baseline. All six articles pass article 5.7 DTD and actual VTool 5.98.2 with zero errors, zero skipped checks and two existing warnings. See validation-results.json and native reports. Unapproved DOI conflicts emit no output, as asserted by the regression tests.

No push performed. Other audit findings remain outstanding.
