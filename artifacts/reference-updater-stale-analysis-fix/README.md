# Stale analysis protection

Analysis is bound to both exact XML inputs and Auto-Add, the setting which affects generated scan rows. Changing any of these clears matches, the open review item, suggestions, and output. Persisted scan rows without a fresh snapshot are invalidated. Merge execution independently verifies that the snapshot still matches. Delayed analysis callbacks and merge completion are guarded against input changes while running.

Formatting, sorting and manual confirmation controls remain usable without rerunning matching because they do not change the input index mapping.

Eight regressions cover original reordering, changed incoming XML, Auto-Add changes, unchanged inputs, fresh reordered analysis, edits during delayed analysis, restored rows without a snapshot, and edits during merging. All 48 reference updater regression scenarios, TypeScript checking and diff checks pass.

Original and freshly merged full article copies pass article 5.7 DTD and actual VTool 5.98.2 with zero errors and skipped checks, retaining two existing warnings. Logs and validation-results.json are retained here. No push performed.
