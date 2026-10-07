# Quote-independent ID preservation

Addresses audit bug 5. Bibliography and internal ID parsing accept single and double quotes and whitespace around the equals sign. Internal ID replacement captures the actual attribute value instead of slicing a double-quoted string, so link remapping works with both styles. Attribute matching requires whitespace before the ID attribute to avoid mistaking other attribute names for ID. Unchanged reference XML is retained verbatim.

Five regressions cover single-quoted original IDs, single-quoted incoming IDs, both inputs single-quoted, unchanged markup preservation, and remapping a single-quoted internal link target. All 53 reference updater scenarios, TypeScript checking and diff checks pass.

Three original/output full article pairs exercise the quote combinations against article 5.7 DTD and actual VTool 5.98.2. All six runs have zero errors and skipped checks, retaining two existing warnings. Fixtures consistently use bb0005 to match existing article citations; source-text IDs remain in a separate unused range. Native reports and validation-results.json are retained here.

No push performed. Numeric label consistency, malformed XML rejection, and drag ordering remain outstanding.
