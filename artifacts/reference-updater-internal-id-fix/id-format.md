# ID allocation convention

New IDs follow prefix plus four digits, in increments of five from 0005 through 9995. Allocation prefers values above IDs already present, then searches unused values within that range if necessary, reserving IDs in both inputs and newly allocated IDs. Input reservation accepts both quote styles. Exhaustion aborts the merge with a descriptive error rather than emitting five-digit IDs. Existing IDs remain preserved by the merge's preservation behavior.

Three regression scenarios cover the first available value, allocation at 9995, and exhaustion of all 1,999 values. All 22 regression scenarios and TypeScript checking pass. Full article DTD/VTool validation is rerun after this change using the internal element fixtures.
