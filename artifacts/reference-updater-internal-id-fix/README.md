# Internal ID preservation fix

Addresses audit bug 3. Original internal IDs are stored as ordered lists by qualified element name. Each incoming element consumes one corresponding original ID rather than repeatedly using the last ID for its prefix. Additional elements use the existing collision-aware allocator, which reserves allocated IDs and checks IDs in both inputs. Custom original IDs are retained as well.

Verification: five internal ID regression scenarios pass (repeated, added, removed, custom IDs, and no internal links), together with the six content-matching and eight numeric-label scenarios. TypeScript checking and diff whitespace checks pass.

Original/output full article copies for repeated, added and removed internal elements all pass article 5.7 DTD and actual VTool 5.98.2: six runs with zero errors and zero skipped checks, retaining two existing warnings each. Reports are saved alongside validation-results.json. The previously validated test article baseline was used; production XML is untouched.

Correspondence is by element type and occurrence order. This fix does not implement internal link target remapping (audit bug 4) or the separate quote-style parser correction. No push performed.
