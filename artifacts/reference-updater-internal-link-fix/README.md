# Internal link remapping

Addresses audit bug 4 for links within each changed bibliography entry. Incoming outer and internal ID changes are recorded and applied to refid tokens and fragment-only xlink:href attributes in a single pass. Single/double quoted link attributes and whitespace-separated refid lists are supported. External URLs and visible citation text are untouched. Internal renumbering disabled leaves internal IDs and their links unchanged.

Four focused regression scenarios pass, alongside the previous 28 scenarios. TypeScript and diff checks pass. Original/output full article copies pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and skipped checks, retaining two existing warnings. Native reports and validation-results.json are saved here.

The full article fixture validates ce:cross-ref refid remapping and preservation of an allowed external URI. Fragment-only ce:inter-ref URLs are covered at function level only: VTool rejects that URI scheme (IRR502), so such a URL is not presented as a validated production example. This change does not create those URLs.

No push performed. Other audit bugs remain outstanding.
