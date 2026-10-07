# Added-reference IDs

User clarification: added references start at bb3000 so they can be located by searching bb3. A dedicated counter starts at 3000 for each merge and advances by five, skipping IDs reserved in either input and earlier allocations. Assigned IDs are applied even when Preserve IDs is disabled. Outer ID replacement accepts either XML quote style. Allocation remains bounded at 9995 and aborts safely if no value is available.

Six regression scenarios pass: bb3000 first allocation, collision with an original bb3000, collision with an incoming bb3000, preservation disabled, incoming single quotes, and multiple additions. Existing matching/internal ID/range regression suites also pass. TypeScript and diff checks pass. No push performed.
