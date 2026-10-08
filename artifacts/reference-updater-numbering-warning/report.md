# Different-number duplicate warning

An unmatched incoming numbered entry is compared with differently numbered originals. Identical content (excluding labels and markup) or an identical DOI produces a visible numbering warning in the scan table and review modal. The entry appears in the duplicate/conflict filters and requires review before it can be added, even with auto-confirm enabled. Auto-Add off leaves it excluded by default.

The warning identifies incoming and existing numbers and states that different numbers cannot replace one another. It provides Discard Incoming and Keep as Separate Reference actions. The latter explicitly selects and confirms an addition; existing originals and citation IDs remain intact. Discard leaves the entry unconfirmed so reselecting it requires review. Split/merge candidate actions do not offer a different-number replacement. Users can correct the input label and analyze again when the incoming number was a mistake.

152 Reference Updater scenarios passed, including five numbering-warning cases. Existing numeric identity tests now verify blocked generation followed by explicit separate retention, rather than automatic additions of differently numbered duplicate content. TypeScript and build passed.

The positive validation fixture explicitly retains [99] separately after review. Its original and output full article test copies pass DTD/native VTool with zero errors and zero skipped checks; two baseline warnings remain. Only the output validation copy adds a body citation to the new bb3000 reference, so native checks can assess a cited addition. The updater itself emits bibliography only and does not rewrite body citations. Evidence is in results.json, validation-results.json and the same-content native logs.
