# Citation target protection

Matched corrections always retain the original outer reference ID. The optional Preserve IDs switch was removed because changing these IDs can break body citations; newly added references still allocate IDs from bb3000 in steps of five, skipping occupied values.

When original full article XML is supplied, generation checks links outside bibliography entries against all original bibliography IDs, including internal element IDs. It blocks any output that would remove an existing target still used by a single/plural refid or a local fragment href. The tool does not rewrite body citations or invent replacement targets. Uncited references can still be excluded.

When only bibliography XML is supplied, exclusions remain available and the success message warns that body citations must be checked. Their targets cannot be verified without the body XML.

Previous output is cleared when another merge starts, including one blocked by pending review or citation protection. Broader automatic output invalidation on every settings/review change and undeclared entity validation remain separate audit findings.

Validation: 100 Reference Updater regression scenarios, including nine citation protection cases. The positive original and corrected bibliography were inserted into full article copies without body retargeting; both DTD and native VTool passed with zero errors and zero skipped checks. The baseline's two unrelated warnings remain. Evidence is in results.json, validation-results.json and the native XML logs. validate.ps1 records the local test prerequisites.
