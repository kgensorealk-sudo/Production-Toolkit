# Generated output validity

Generated results are associated with the exact input XML, scan/review decisions and ordering, internal ID setting, alphabetical/manual ordering, label conversion and auto-confirm setting. A mismatch hides the result synchronously and disables copying; an effect clears stored output, suggestions, diff and change counters. Reloaded local-storage output cannot be reused without a new generation snapshot.

The same state snapshot is checked after asynchronous merge batches. Changes during generation prevent stale publication. Diff generation also checks the snapshot before publishing its display, and changed state cannot receive an outdated success notification.

118 Reference Updater scenarios passed, including 18 output-validity scenarios. Existing negative-output tests now assert no usable output, allowing the intentional empty string produced by invalidation. TypeScript and production build passed, retaining the existing bundle-size/Browserslist build warnings. The citation protection fixture's original and generated full article copies were rechecked against DTD and native VTool: zero errors and zero skipped checks, with the two existing baseline warnings. Evidence remains in validation-results.json and the native XML logs alongside this report.

Undeclared XML entity validation remains the next separate audit finding; this change addresses stale output.
