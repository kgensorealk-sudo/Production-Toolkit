# Same-label review sample

Paste original.xml into Original XML and updated.xml into Updated XML. These are bibliography fragments for the tool, rather than standalone full article documents. Turn Auto-Add off for this test, then Analyze.

Original: Smith, 2020; title Alpha evidence; ordered authors A. Smith, Jones, Lee.

Incoming candidate bb0900: Smith, 2020; title Unrelated investigation; ordered authors A. Smith, Jones, Brown.

Incoming candidate bb0905: Smith, 2020; title Alpha evidence; ordered authors A. Smith, Jones, Lee; source text corrected.

Expected: bb0905 ranks first because its title and author list agree. It requires review even with Auto-Confirm enabled. bb0900 remains excluded with Auto-Add off. Open review, inspect the candidate, and choose Keep as Merge. The final output retains bb0005, rf0005 and se0005 with the corrected source text. Compare expected-after-approval.xml; whitespace may differ.
