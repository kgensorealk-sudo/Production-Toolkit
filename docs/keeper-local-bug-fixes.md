# Local Keeper: seven reviewed bugs addressed

2026-10-09. Local working-tree changes, not pushed/deployed. No manuscript uploads or Supabase changes.

1. ZIP source IDs derive from exact source bytes, role and archive path. Retry of identical bytes preserves conversation scope. Existing randomly assigned source IDs are also retained when old task content is unchanged, preserving compatibility with already saved local tasks.
2. Each task has its own workspace record under its account. Task switching serializes the current save before restoring the destination's draft, sources, conversation and source scope. The last selected task is restored after refresh. Previous account-level workspaces remain available in the standalone workspace.
3. IndexedDB writes atomically compare the expected revision before replacing a workspace. Same-tab writes are serialized. A stale tab receives a conflict, keeps its unsaved changes in memory and offers local export plus reload of the saved version. It cannot silently overwrite the other tab. This is conflict detection, not automatic merging.
4. Pasted XML becomes a retained local source rather than disappearing from the active source list after the first question. Cached evidence is reused only when exact source IDs, kinds, names and content agree. Late inspection failures are ignored after task/account changes.
5. A failed/blocked local restore displays an explicit error and Retry local storage control. Blank state is not saved over unread data. Blocked database-open requests close any eventual late connection rather than leaving it open.
6. Local imports use raw XML/PDF source limits, independent of the server JSON/base64 transport cap. A 3 MB PDF is accepted locally. Existing per-file 4 MB and combined 8 MB limits remain, including pasted XML before worker dispatch.
7. Pending-task recovery records a corrupt package's failure and continues later packages. A failure to persist that failure is treated as a storage-wide error and stops safely rather than pretending recovery succeeded.

## Verification

- Added IndexedDB lifecycle tests with fake-indexeddb: task/account separation, selected-task restoration, legacy migration, serialized saves, concurrent atomic conflict rejection, blocked overwrite and restore failures.
- Added cache-source and legacy source-ID tests, pending-queue continuation/storage-failure tests, raw limit checks and regression assertions for the previously reproduced retry/import issues.
- Keeper regression suite, TypeScript and production build checked.
- Isolated browser fixture renders the actual KeeperSandbox with a synthetic account and a network-disabled Supabase adapter. Verified A/B drafts, local report generation, refresh retention, visible storage failure/recovery, two-tab conflict UI, and pasted-XML follow-up reports. The fixture's main-thread fetch trap recorded zero calls during these operations. This does not claim complete worker-level network interception or a live authenticated production test.
- Original package data, detailed evidence and task workspaces remain local. Optional cloud summary syncing is still disabled. Normal browser-data deletion still removes local records; retain original ZIP backups.

Full task backup/import, immutable package-replacement revision UI and ORDER semantic inspection remain separate deferred work, not part of these seven fixes. The conflict export contains the unsaved workspace, including manuscript data; it is not a complete archive of every local task.
