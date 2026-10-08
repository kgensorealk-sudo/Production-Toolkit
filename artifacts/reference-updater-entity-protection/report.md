# Entity protection

Undeclared named entities now block analysis/generation with the name and an actionable correction message. Comments, processing instructions and CDATA remain literal/non-markup contexts and do not require declarations for entity-looking text.

The supported article character catalog contains 2,206 numeric character mappings extracted from local DTD dependencies htmlmathml-f.ent and ESextra.ent. Valid named character entities and supplied internal text declarations are expanded before metadata matching and bibliography generation. Output contains the actual characters, retaining XML escaping where required. It does not depend on discarded DOCTYPE declarations. Numeric references and the five predefined XML entities retain the existing behavior.

Internal declarations take precedence over the catalog. Nested text declarations are supported with recursion/depth/total-expansion limits. Referenced external entities, markup-valued entities and unresolved parameter entities fail explicitly rather than fetching external resources or emitting unresolved names. Unreferenced external image/attachment declarations in full article DOCTYPEs remain usable.

Verification: 140 Reference Updater scenarios passed, including 22 entity cases. TypeScript and production build passed. Two positive generated fixtures (DTD character entities and supplied text entities) and their original baselines were inserted into full article test copies: all four DTD/native VTool checks passed with zero errors and zero skips, retaining the baseline's two unrelated warnings. Unknown entity, malformed/recursive entity and external entity cases are rejection tests, not positive validation cases.

Native reports and validation-results.json record the positive checks. validate.ps1 records local baseline, DTD and VTool paths. Runtime checks use a supported character catalog and supplied text declarations; they do not load arbitrary external DTDs or perform complete DTD/VTool validation in the application.
